import { pageTitles } from "@/lib/page-titles";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgendaSection, AgendaState } from "@/components/doctor/DoctorAgenda";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { InfoNotice } from "@/components/common";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { doctorAgenda } from "@/lib/doctor-workspace";
import { useI18n } from "@/lib/i18n";
import { useDoctorAppointments } from "@/lib/supabase/doctor";

const STATUS = ["pending", "confirmed", "arrived", "completed", "cancelled"] as const;

export const Route = createFileRoute("/doctor/appointments")({
  validateSearch: ({ day }: Record<string, unknown>): { day?: "today" } =>
    day === "today" ? { day } : {},
  head: () => ({ meta: [{ title: pageTitles.appointments }] }),
  component: DoctorAppointmentsPage,
});

function DoctorAppointmentsPage() {
  const { t } = useI18n();
  const { day } = Route.useSearch();
  return (
    <DoctorShell
      title={t("doctorAppointments.title")}
      description={t("doctorAppointments.subtitle")}
    >
      {(me) => <AppointmentsList key={me.id + (day ?? "")} todayOnly={day === "today"} />}
    </DoctorShell>
  );
}

function AppointmentsList({ todayOnly }: { todayOnly: boolean }) {
  const { t, fmt } = useI18n();
  const appointments = useDoctorAppointments(true);
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState(todayOnly ? "today" : "all");
  const [status, setStatus] = useState("");
  const agenda = doctorAgenda(appointments.data ?? []);
  const matches = (item: (typeof agenda.upcoming)[number]) =>
    (!status || item.status === status) && (!date || item.date === date);

  if (!appointments.isSuccess) return <AgendaState query={appointments} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="doctor-period">{t("doctorWorkspace.period")}</Label>
          <NativeSelect
            id="doctor-period"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setDate("");
            }}
          >
            <option value="all">{t("doctorWorkspace.allAppointments")}</option>
            <option value="today">{t("common.today")}</option>
            <option value="upcoming">{t("doctorAppointments.upcoming")}</option>
            <option value="past">{t("doctorAppointments.past")}</option>
          </NativeSelect>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="doctor-status">{t("doctorWorkspace.status")}</Label>
          <NativeSelect
            id="doctor-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("doctorWorkspace.allStatuses")}</option>
            {STATUS.map((value) => (
              <option key={value} value={value}>
                {t(("status." + value) as `status.${typeof value}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="doctor-day">{t("doctorWorkspace.date")}</Label>
          <Input
            id="doctor-day"
            className="min-w-0"
            type="date"
            value={period === "today" ? agenda.today : date}
            disabled={period === "today"}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
      <InfoNotice className="text-sm">{t("doctorAppointments.readOnly")}</InfoNotice>
      {period === "today" ? (
        <AgendaSection
          title={t("common.today") + " · " + fmt.longDate(agenda.today)}
          items={agenda.todayItems.filter(matches)}
          empty={t("doctorWorkspace.noMatches")}
        />
      ) : null}
      {period === "all" || period === "upcoming" ? (
        <AgendaSection
          title={t("doctorAppointments.upcoming")}
          items={agenda.upcoming.filter(matches)}
          empty={t(
            date || status ? "doctorWorkspace.noMatches" : "doctorAppointments.noneUpcoming",
          )}
        />
      ) : null}
      {period === "all" || period === "past" ? (
        <AgendaSection
          title={t("doctorAppointments.past")}
          items={agenda.history.filter(matches)}
          empty={t(date || status ? "doctorWorkspace.noMatches" : "doctorAppointments.nonePast")}
        />
      ) : null}
    </div>
  );
}
