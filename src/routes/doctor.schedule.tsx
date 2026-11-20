import { pageTitles } from "@/lib/page-titles";
import { createFileRoute } from "@tanstack/react-router";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { DoctorAvailability } from "@/components/doctor/DoctorAvailability";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/doctor/schedule")({
  head: () => ({ meta: [{ title: pageTitles.doctor }] }),
  component: DoctorSchedulePage,
});

function DoctorSchedulePage() {
  const { t } = useI18n();
  return (
    <DoctorShell title={t("doctorSchedule.title")} description={t("doctorSchedule.subtitle")}>
      {(me) => <DoctorAvailability key={me.id} me={me} />}
    </DoctorShell>
  );
}
