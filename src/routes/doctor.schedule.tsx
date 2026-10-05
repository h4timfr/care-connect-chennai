import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { EmptyState, InfoNotice } from "@/components/common";
import { VerificationPill } from "@/components/ProviderStatus";
import { ScheduleForm, ScheduleRow } from "@/components/ScheduleEditor";
import { useI18n } from "@/lib/i18n";
import type { MyDoctor } from "@/lib/supabase/doctor";
import { describeDataError } from "@/lib/supabase/errors";
import { useClinicSchedules } from "@/lib/supabase/providers";

export const Route = createFileRoute("/doctor/schedule")({
  head: () => ({ meta: [{ title: "Schedule — CareConnect Doctor Portal" }] }),
  component: DoctorSchedulePage,
});

function DoctorSchedulePage() {
  const { t } = useI18n();
  return (
    <DoctorShell title={t("doctorSchedule.title")} description={t("doctorSchedule.subtitle")}>
      {(me) => <Schedules me={me} />}
    </DoctorShell>
  );
}

function Schedules({ me }: { me: MyDoctor }) {
  const { t } = useI18n();
  if (me.links.length === 0) {
    return <EmptyState icon={CalendarClock} title={t("doctorDashboard.noClinics")} />;
  }
  return (
    <div className="space-y-4">
      <InfoNotice className="text-sm">{t("doctorSchedule.note")}</InfoNotice>
      <ul className="grid gap-4 lg:grid-cols-2">
        {me.links.map((link) => (
          <ClinicHours
            key={link.clinicId}
            doctorId={me.id}
            clinicId={link.clinicId}
            clinicName={link.clinicName}
            bookable={link.verified && link.active}
          />
        ))}
      </ul>
    </div>
  );
}

function ClinicHours({
  doctorId,
  clinicId,
  clinicName,
  bookable,
}: {
  doctorId: string;
  clinicId: string;
  clinicName: string;
  bookable: boolean;
}) {
  const { t } = useI18n();
  // Hours are public (patients see them when booking); only verified links are editable.
  const schedules = useClinicSchedules(bookable ? clinicId : undefined);
  const mine = (schedules.data ?? []).filter((s) => s.doctorId === doctorId);
  return (
    <li className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold [overflow-wrap:anywhere]" dir="auto">
          {clinicName}
        </h2>
        <VerificationPill state={bookable ? "verified" : "pending"} />
      </div>
      {!bookable ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("doctorSchedule.pending")}</p>
      ) : (
        <>
          {schedules.error ? (
            <p className="mt-3 text-sm text-destructive">{t(describeDataError(schedules.error))}</p>
          ) : mine.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("schedule.none")}</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {mine.map((s) => (
                <ScheduleRow key={s.id} schedule={s} clinicId={clinicId} editable />
              ))}
            </ul>
          )}
          <ScheduleForm clinicId={clinicId} doctorId={doctorId} existing={mine} />
        </>
      )}
    </li>
  );
}
