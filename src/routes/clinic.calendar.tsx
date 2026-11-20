import { pageTitles } from "@/lib/page-titles";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { EmptyState, ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { addDays, isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeStatusError } from "@/lib/supabase/appointments";
import { describeDataError } from "@/lib/supabase/errors";
import { useClinicDoctorLinks, useClinicSchedules } from "@/lib/supabase/providers";

export const Route = createFileRoute("/clinic/calendar")({
  head: () => ({ meta: [{ title: pageTitles.clinic }] }),
  component: ClinicCalendar,
});

function ClinicCalendar() {
  const { activeClinic } = useApp();
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <ClinicShell title={t("clinicCalendar.title")} description={t("clinicCalendar.timeIst")}>
      {activeClinic ? (
        <DaySchedule key={[user?.id, activeClinic.id].join(":")} clinicId={activeClinic.id} />
      ) : null}
    </ClinicShell>
  );
}

function DaySchedule({ clinicId }: { clinicId: string }) {
  const { clinicAppointments, clinicAppointmentsStatus: status, doctorById } = useApp();
  const { t, fmt } = useI18n();
  const [dayOffset, setDayOffset] = useState(0);
  const [doctorId, setDoctorId] = useState("");
  const date = isoDate(addDays(new Date(), dayOffset));
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const roster = useClinicDoctorLinks(clinicId);
  const weekly = useClinicSchedules(clinicId);
  const doctors = roster.error ? [] : (roster.data ?? []);
  const doctorName = (id: string) =>
    doctors.find((doctor) => doctor.doctorId === id)?.doctorName ??
    doctorById(id)?.name ??
    t("clinicWorkspace.doctorUnavailable");
  const appointments = clinicAppointments
    .filter(
      (row) =>
        row.clinicId === clinicId &&
        row.date === date &&
        row.status !== "cancelled" &&
        (!doctorId || row.doctorId === doctorId),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const verified = new Set(
    doctors.filter((link) => link.active && link.state === "verified").map((link) => link.doctorId),
  );
  const windows = (weekly.data ?? [])
    .filter(
      (row) =>
        row.dayOfWeek === weekday &&
        verified.has(row.doctorId) &&
        (!doctorId || doctorId === row.doctorId),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const hoursError = roster.error ?? weekly.error;

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            className="min-w-0 font-display font-semibold [overflow-wrap:anywhere]"
            aria-live="polite"
          >
            {fmt.longDate(date)}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-9 whitespace-normal"
              disabled={dayOffset === 0}
              onClick={() => setDayOffset(0)}
            >
              {t("clinicCalendar.today")}
            </Button>
            <div className="flex overflow-hidden rounded-lg border">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => setDayOffset((previous) => previous - 1)}
                aria-label={t("clinicCalendar.previousDay")}
              >
                <ChevronLeft aria-hidden className="rtl:rotate-180" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => setDayOffset((previous) => previous + 1)}
                aria-label={t("clinicCalendar.nextDay")}
              >
                <ChevronRight aria-hidden className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </div>
        {doctors.length > 1 ? (
          <div
            className="flex flex-wrap gap-1.5 border-t pt-3"
            role="group"
            aria-label={t("clinicCalendar.filterByDoctor")}
          >
            <Button
              size="sm"
              variant={!doctorId ? "default" : "outline"}
              aria-pressed={!doctorId}
              onClick={() => setDoctorId("")}
            >
              {t("clinicCalendar.allDoctors")}
            </Button>
            {doctors.map((doctor) => (
              <Button
                key={doctor.doctorId}
                size="sm"
                className="h-auto min-h-9 max-w-full whitespace-normal [overflow-wrap:anywhere]"
                variant={doctorId === doctor.doctorId ? "default" : "outline"}
                aria-pressed={doctorId === doctor.doctorId}
                onClick={() => setDoctorId(doctor.doctorId)}
              >
                {doctor.doctorName}
              </Button>
            ))}
          </div>
        ) : null}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section
          className="surface-card min-w-0 overflow-hidden"
          aria-labelledby="clinic-calendar-visits"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <h2
              id="clinic-calendar-visits"
              className="flex items-center gap-2 font-display font-semibold"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              {t("clinicAppointments.title")}
            </h2>
            {status.isLoading || status.error ? null : (
              <span className="text-sm text-muted-foreground">
                {t.plural("clinicCalendar.count", appointments.length)}
              </span>
            )}
          </div>
          {status.isLoading ? (
            <PageLoader label={t("clinicCalendar.loading")} />
          ) : status.error ? (
            <ErrorState
              title={t("clinicCalendar.loadError")}
              message={t(describeStatusError(status.error))}
              onRetry={status.refetch}
            />
          ) : !appointments.length ? (
            <EmptyState icon={CalendarDays} title={t("clinicWorkspace.noDayVisits")} />
          ) : (
            <ol className="divide-y">
              {appointments.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                >
                  <time
                    className="shrink-0 font-semibold text-primary"
                    dateTime={row.time}
                    dir="ltr"
                  >
                    {fmt.time(row.time)}
                  </time>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p dir="auto" className="font-medium">
                      {row.patientName || t("common.unknownPatient")}
                    </p>
                    <p dir="auto" className="text-muted-foreground">
                      {doctorName(row.doctorId)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          className="surface-card min-w-0 overflow-hidden"
          aria-labelledby="clinic-calendar-hours"
        >
          <div className="border-b p-4">
            <h2
              id="clinic-calendar-hours"
              className="flex items-center gap-2 font-display font-semibold"
            >
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              {t("schedule.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("clinicWorkspace.weeklyHoursNote")}
            </p>
          </div>
          {roster.isLoading || weekly.isLoading ? (
            <PageLoader />
          ) : hoursError ? (
            <ErrorState
              title={t("doctorWorkspace.scheduleLoadError")}
              message={t(describeDataError(hoursError))}
              onRetry={() => void (roster.error ? roster.refetch() : weekly.refetch())}
            />
          ) : windows.length > 0 ? (
            <ul className="divide-y">
              {windows.map((window) => (
                <li key={window.id} className="px-4 py-3 text-sm [overflow-wrap:anywhere]">
                  <p dir="auto" className="font-medium">
                    {doctorName(window.doctorId)}
                  </p>
                  <p className="text-muted-foreground">
                    <bdi>
                      {fmt.time(window.startTime)} – {fmt.time(window.endTime)}
                    </bdi>
                    {" · "}
                    {t("schedule.slotLength", { minutes: fmt.number(window.slotMinutes) })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t("clinicWorkspace.noDayHours")}</p>
          )}
          <div className="border-t p-4">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-auto min-h-9 whitespace-normal"
            >
              <Link to="/clinic/doctors" hash="clinic-consultation-hours">
                {t("setup.manageHours")}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
