import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, MessageSquare, UserRound } from "lucide-react";
import { AgendaSection, AgendaState } from "./DoctorAgenda";
import { DoctorClinics } from "./DoctorClinics";
import { Button } from "@/components/ui/button";
import { doctorAgenda } from "@/lib/doctor-workspace";
import { useI18n } from "@/lib/i18n";
import { useDoctorAppointments, type MyDoctor } from "@/lib/supabase/doctor";

const shortcuts = [
  { to: "/doctor/schedule", title: "doctorSchedule.title", icon: CalendarClock },
  { to: "/doctor/messages", title: "doctorMessages.title", icon: MessageSquare },
  { to: "/doctor/profile", title: "doctorProfile.title", icon: UserRound },
] as const;

export function DoctorOverview({ me }: { me: MyDoctor }) {
  const { t, fmt } = useI18n();
  const appointments = useDoctorAppointments(true);
  const agenda = doctorAgenda(appointments.data ?? []);
  const later = agenda.upcoming.filter((item) => item.date !== agenda.today);
  const stats = [
    { label: t("doctorWorkspace.todayAppointments"), value: agenda.todayItems.length },
    { label: t("doctorDashboard.upcoming"), value: later.length },
    { label: t("doctorDashboard.clinics"), value: me.links.length },
  ];

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="doctor-workspace-identity"
        className="rounded-3xl border border-primary/25 bg-linear-to-br from-primary/15 via-primary/5 to-card p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-card text-primary"
          >
            <UserRound className="size-6" />
          </div>
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <p className="text-sm font-medium text-primary">{t("portal.doctor.name")}</p>
            <h2
              id="doctor-workspace-identity"
              className="font-display text-2xl font-bold sm:text-4xl"
            >
              <bdi>{me.name}</bdi>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmt.specialty(me.specialtyId)} · {fmt.fullDate(agenda.today)}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-1.5 min-[400px]:grid-cols-3 sm:gap-2">
          {stats.map(({ label, value }, index) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-between gap-2 rounded-xl border bg-card/85 px-3 py-2 min-[400px]:flex-col-reverse min-[400px]:items-start min-[400px]:justify-end"
            >
              <dt className="text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
                {label}
              </dt>
              <dd className="font-display text-xl font-bold tabular-nums">
                {index === 2 || appointments.isSuccess ? fmt.number(value) : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <nav aria-label={t("doctorWorkspace.quickLinks")} className="grid grid-cols-3 gap-2">
        {shortcuts.map(({ to, title, icon: Icon }) => (
          <Button
            key={to}
            asChild
            variant="outline"
            className="h-auto min-h-12 flex-wrap justify-center whitespace-normal rounded-xl px-1.5 text-center text-xs sm:justify-start sm:px-4 sm:text-start sm:text-sm"
          >
            <Link to={to}>
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {t(title)}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/doctor/appointments" search={{ day: "today" }}>
                <CalendarDays aria-hidden />
                {t("doctorWorkspace.viewToday")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/doctor/appointments" search={{}}>
                {t("doctorWorkspace.allAppointments")}
              </Link>
            </Button>
          </div>
          {appointments.isSuccess ? (
            <>
              <AgendaSection
                title={t("doctorWorkspace.todayQueue")}
                items={agenda.todayQueue.slice(0, 5)}
                empty={t("doctorWorkspace.noTodayQueue")}
                compact
              />
              <AgendaSection
                title={t("doctorDashboard.upcoming")}
                items={later.slice(0, 5)}
                empty={t("doctorAppointments.noneUpcoming")}
                compact
              />
            </>
          ) : (
            <AgendaState query={appointments} />
          )}
        </div>
        <DoctorClinics me={me} />
      </div>
    </div>
  );
}
