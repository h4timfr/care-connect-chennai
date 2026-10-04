import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { CatalogNotice } from "@/components/CatalogNotice";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { addDays, isoDate, longDate, shortDate, to12h } from "@/lib/format";
import { describeStatusError } from "@/lib/supabase/appointments";

export const Route = createFileRoute("/clinic/calendar")({
  component: ClinicCalendar,
});

/** Default visible hours; extended automatically to cover any appointment outside them. */
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 20;

const hourLabel = (h: number) => (h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);

function ClinicCalendar() {
  const { activeClinic, clinicAppointmentsStatus: status } = useApp();
  const [dayOffset, setDayOffset] = useState(0);
  const date = isoDate(addDays(new Date(), dayOffset));

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label="Loading calendar…" />;
  } else if (status.error) {
    body = (
      <ErrorState
        title="We couldn't load the calendar"
        message={describeStatusError(status.error)}
        onRetry={status.refetch}
      />
    );
  } else {
    body = <DaySchedule clinicId={activeClinic.id} date={date} />;
  }

  return (
    <ClinicShell
      title="Calendar"
      description={longDate(date)}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDayOffset(0)}
            disabled={dayOffset === 0}
          >
            Today
          </Button>
          <div className="flex items-center gap-1 rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={() => setDayOffset((d) => d - 1)}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="px-2 text-sm font-medium" aria-live="polite">
              {shortDate(date)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={() => setDayOffset((d) => d + 1)}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      }
    >
      {body}
    </ClinicShell>
  );
}

function DaySchedule({ clinicId, date }: { clinicId: string; date: string }) {
  const { clinicAppointments, doctorsOfClinic } = useApp();
  const [doctorId, setDoctorId] = useState("all");

  const doctors = doctorsOfClinic(clinicId);
  const appointments = clinicAppointments.filter(
    (a) =>
      a.clinicId === clinicId &&
      a.date === date &&
      a.status !== "cancelled" &&
      (doctorId === "all" || a.doctorId === doctorId),
  );
  const hourOf = (time: string) => Number(time.split(":")[0]);
  const appointmentHours = appointments.map((a) => hourOf(a.time));
  const first = Math.min(DEFAULT_FIRST_HOUR, ...appointmentHours);
  const last = Math.max(DEFAULT_LAST_HOUR, ...appointmentHours);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <div className="space-y-4">
      <CatalogNotice />
      {doctors.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-3"
          role="group"
          aria-label="Filter by doctor"
        >
          <Button
            variant={doctorId === "all" ? "default" : "outline"}
            size="sm"
            aria-pressed={doctorId === "all"}
            onClick={() => setDoctorId("all")}
          >
            All doctors
          </Button>
          {doctors.map((d) => (
            <Button
              key={d.id}
              variant={doctorId === d.id ? "default" : "outline"}
              size="sm"
              aria-pressed={doctorId === d.id}
              onClick={() => setDoctorId(d.id)}
            >
              {d.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="surface-card overflow-hidden">
        <div className="grid grid-cols-[64px_1fr] border-b bg-muted/50 text-xs font-medium text-muted-foreground">
          <div className="border-r p-3 text-center">Time (IST)</div>
          <div className="p-3">
            {appointments.length} {appointments.length === 1 ? "appointment" : "appointments"}
          </div>
        </div>
        <ol className="divide-y">
          {hours.map((h) => {
            const inHour = appointments
              .filter((a) => hourOf(a.time) === h)
              .sort((a, b) => a.time.localeCompare(b.time));
            return (
              <li key={h} className="grid min-h-16 grid-cols-[64px_1fr]">
                <div className="border-r bg-muted/10 p-3 text-right text-xs text-muted-foreground">
                  {hourLabel(h)}
                </div>
                <div className="flex flex-wrap items-start gap-2 p-2">
                  {inHour.map((a) => (
                    <div
                      key={a.id}
                      className="flex w-full flex-col gap-1 rounded-lg border bg-background p-2 text-sm shadow-sm sm:w-[260px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-medium">{a.patientName}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {to12h(a.time)}
                        {doctors.find((d) => d.id === a.doctorId)
                          ? ` · ${doctors.find((d) => d.id === a.doctorId)?.name}`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
