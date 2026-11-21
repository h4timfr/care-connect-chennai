import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  MessageSquare,
  Stethoscope,
} from "lucide-react";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { VerificationPill } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import type { AgendaView } from "@/lib/clinic-agenda-view";
import { clinicAgenda } from "@/lib/clinic-workspace";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";
import { useClinicDoctorLinks, useClinicSchedules } from "@/lib/supabase/providers";
import type { MemberClinic } from "@/lib/supabase/queries";

export function ClinicOverview({ clinic, now }: { clinic: MemberClinic; now: Date }) {
  const { t, fmt } = useI18n();
  const {
    catalog,
    clinicAppointments,
    clinicAppointmentsStatus: appointments,
    doctorById,
  } = useApp();
  const roster = useClinicDoctorLinks(clinic.id);
  const links = roster.error ? [] : (roster.data ?? []);
  const nameFor = (id: string) =>
    links.find((link) => link.doctorId === id)?.doctorName ?? doctorById(id)?.name;
  const verified = links.filter((link) => link.active && link.state === "verified");
  const schedules = useClinicSchedules(verified.length ? clinic.id : undefined);
  const verifiedIds = new Set(verified.map((link) => link.doctorId));
  const scheduledDoctors = new Set(
    (schedules.error ? [] : (schedules.data ?? []))
      .filter((schedule) => verifiedIds.has(schedule.doctorId))
      .map((schedule) => schedule.doctorId),
  );
  const today = clinicAgenda(clinicAppointments, clinic.id, { view: "today" }, now).filter(
    (row) => row.status !== "cancelled",
  );
  const upcoming = clinicAgenda(clinicAppointments, clinic.id, { view: "upcoming" }, now);
  const pending = clinicAgenda(clinicAppointments, clinic.id, { view: "pending" }, now);
  const counts = [
    {
      view: "today",
      label: "clinicDashboard.todaysVisits",
      count: today.length,
      icon: CalendarDays,
    },
    {
      view: "upcoming",
      label: "clinicWorkspace.upcomingBookings",
      count: upcoming.length,
      icon: CalendarRange,
    },
    {
      view: "pending",
      label: "clinicDashboard.awaiting",
      count: pending.length,
      icon: ClipboardList,
    },
  ] as const;
  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border bg-gradient-to-br from-primary-soft/75 via-card to-card p-4 shadow-sm sm:p-6"
        aria-labelledby="clinic-overview-identity"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <h2
                id="clinic-overview-identity"
                dir="auto"
                className="font-display text-xl font-bold [overflow-wrap:anywhere] sm:text-2xl"
              >
                {clinic.name}
              </h2>
              {clinic.isSample ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t("clinicProfile.listingSample")}
                </span>
              ) : (
                <VerificationPill state={clinic.verificationState} />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[clinic.area, t("common.chennai")].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal">
            <Link to="/clinic/profile">{t("clinicNav.profile")}</Link>
          </Button>
        </div>
      </section>

      {catalog.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive"
        >
          <p>{t("catalog.notice", { reason: t(describeDataError(catalog.error)) })}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void catalog.refetch();
              if (roster.error) void roster.refetch();
              if (schedules.error) void schedules.refetch();
            }}
          >
            {t("common.tryAgain")}
          </Button>
        </div>
      ) : null}
      {appointments.error ? (
        <ErrorState
          title={t("clinicDashboard.loadError")}
          message={t(describeDataError(appointments.error))}
          onRetry={appointments.refetch}
        />
      ) : appointments.isLoading ? (
        <PageLoader label={t("clinicDashboard.loading")} />
      ) : (
        <>
          <div className="grid gap-2 min-[375px]:grid-cols-2 sm:grid-cols-3">
            {counts.map(({ view, label, count, icon: Icon }) => (
              <Link
                key={view}
                to="/clinic/appointments"
                search={{ view }}
                className="min-w-0 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 font-display text-2xl font-bold">{fmt.number(count)}</p>
                <p className="text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
                  {t(label)}
                </p>
              </Link>
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <AppointmentPreview
              title="clinicDashboard.schedule"
              empty="clinicDashboard.noneToday"
              rows={today}
              doctorName={nameFor}
              view="today"
            />
            <AppointmentPreview
              title="clinicWorkspace.upcomingBookings"
              empty="doctorAppointments.noneUpcoming"
              rows={upcoming}
              doctorName={nameFor}
              view="upcoming"
            />
          </div>
        </>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="surface-card min-w-0 p-4">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Stethoscope className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            {t("clinicDashboard.doctors")}
          </h2>
          {roster.isLoading || schedules.isLoading ? (
            <p className="my-3 text-sm text-muted-foreground" role="status">
              {t("common.loading")}
            </p>
          ) : roster.error || schedules.error ? (
            <div className="my-3 space-y-2 text-sm" role="alert">
              <p>{t(describeDataError(roster.error ?? schedules.error))}</p>
              {!catalog.error ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void (roster.error ? roster.refetch() : schedules.refetch())}
                >
                  {t("common.tryAgain")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="my-3 text-sm text-muted-foreground">
              {t("clinicWorkspace.rosterSummary", {
                verified: fmt.number(verified.length),
                scheduled: fmt.number(scheduledDoctors.size),
              })}
            </p>
          )}
          <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal">
            <Link to="/clinic/doctors">{t("clinicNav.doctors")}</Link>
          </Button>
        </div>
        <div className="surface-card min-w-0 p-4">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            {t("clinicMessages.title")}
          </h2>
          <p className="my-3 text-sm text-muted-foreground">{t("clinicMessages.subtitle")}</p>
          <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal">
            <Link to="/clinic/messages">{t("clinicNav.messages")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function AppointmentPreview({
  title,
  empty,
  rows,
  doctorName,
  view,
}: {
  title: "clinicDashboard.schedule" | "clinicWorkspace.upcomingBookings";
  empty: "clinicDashboard.noneToday" | "doctorAppointments.noneUpcoming";
  rows: ReturnType<typeof clinicAgenda>;
  doctorName: (doctorId: string) => string | undefined;
  view: AgendaView;
}) {
  const { t, fmt } = useI18n();
  return (
    <section className="surface-card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <h2 className="font-display font-semibold">{t(title)}</h2>
        <Link
          to="/clinic/appointments"
          search={{ view }}
          className="rounded text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("clinicWorkspace.viewAppointments")}
        </Link>
      </div>
      {rows.length ? (
        <ul className="divide-y">
          {rows.slice(0, 4).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm"
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p dir="auto" className="font-medium">
                  {row.patientName || t("common.unknownPatient")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmt.shortDate(row.date)} · {fmt.timeIst(row.time)}
                </p>
                <p dir="auto" className="text-xs text-muted-foreground">
                  {doctorName(row.doctorId) ?? t("clinicWorkspace.doctorUnavailable")}
                </p>
              </div>
              <StatusBadge status={row.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">{t(empty)}</p>
      )}
    </section>
  );
}
