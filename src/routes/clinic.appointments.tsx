import { pageTitles } from "@/lib/page-titles";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { toast } from "@/lib/toast";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { EmptyState, ErrorState, PageLoader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { describeStatusError } from "@/lib/supabase/appointments";
import { useClinicDoctorLinks } from "@/lib/supabase/providers";
import { isAgendaView, type AgendaView } from "@/lib/clinic-agenda-view";
import { appointmentActions, clinicAgenda, type AppointmentAction } from "@/lib/clinic-workspace";
import type { Appointment, AppointmentStatus } from "@/lib/types";

export const Route = createFileRoute("/clinic/appointments")({
  head: () => ({ meta: [{ title: pageTitles.appointments }] }),
  validateSearch: ({ view }: Record<string, unknown>): { view?: AgendaView } =>
    isAgendaView(view) ? { view } : {},
  component: ClinicAppointments,
});

const VIEWS: { value: AgendaView; label: MessageKey }[] = [
  { value: "all", label: "clinicAppointments.filter.all" },
  { value: "today", label: "common.today" },
  { value: "upcoming", label: "clinicAppointments.filter.upcoming" },
  { value: "history", label: "clinicWorkspace.history" },
  { value: "pending", label: "clinicAppointments.filter.pending" },
];
const STATUSES = Object.keys(appointmentActions) as AppointmentStatus[];

function ClinicAppointments() {
  const { clinicAppointments, clinicAppointmentsStatus: status, activeClinic } = useApp();
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <ClinicShell
      title={t("clinicAppointments.title")}
      description={t("clinicAppointments.subtitle")}
    >
      {activeClinic &&
        (status.isLoading ? (
          <PageLoader label={t("clinicAppointments.loading")} />
        ) : status.error ? (
          <ErrorState
            title={t("clinicAppointments.loadError")}
            message={t(describeStatusError(status.error))}
            onRetry={status.refetch}
          />
        ) : (
          <AppointmentWorkspace
            key={[user?.id, activeClinic.id].join(":")}
            clinicId={activeClinic.id}
            clinicName={activeClinic.name}
            appointments={clinicAppointments}
          />
        ))}
    </ClinicShell>
  );
}

function AppointmentWorkspace({
  clinicId,
  clinicName,
  appointments,
}: {
  clinicId: string;
  clinicName: string;
  appointments: Appointment[];
}) {
  const { t, fmt } = useI18n();
  const { catalog, doctorById, setAppointmentStatus } = useApp();
  const { view = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [date, setDate] = useState("");
  const [doctor, setDoctor] = useState("");
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [selectedId, setSelectedId] = useState<string>();
  const [choice, setChoice] = useState<{
    action: AppointmentAction;
    previous: AppointmentStatus;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const filters = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clinicRows = appointments.filter((row) => row.clinicId === clinicId);
  const doctorIds = [...new Set(clinicRows.map((row) => row.doctorId))];
  const needsRoster = doctorIds.some((id) => !doctorById(id));
  const roster = useClinicDoctorLinks(needsRoster && !catalog.isLoading ? clinicId : undefined);
  const doctorName = (id: string) =>
    doctorById(id)?.name ??
    (roster.error ? undefined : roster.data?.find((link) => link.doctorId === id)?.doctorName) ??
    t("clinicWorkspace.doctorUnavailable");
  const rows = clinicAgenda(clinicRows, clinicId, {
    view,
    ...(date && { date }),
    ...(doctor && { doctorId: doctor }),
    ...(status && { status }),
  });
  const selected = selectedId ? clinicRows.find((row) => row.id === selectedId) : undefined;
  const changed = !!choice && choice.previous !== selected?.status;
  const patientName = (row: Appointment) => row.patientName || t("common.unknownPatient");
  const showAppointment = (
    button: HTMLButtonElement,
    row: Appointment,
    action?: AppointmentAction,
  ) => {
    trigger.current = button;
    setSelectedId(row.id);
    setChoice(action ? { action, previous: row.status } : undefined);
    setError(undefined);
  };
  const close = () => {
    if (inFlight.current) return;
    setSelectedId(undefined);
    setChoice(undefined);
    setError(undefined);
  };
  const apply = async () => {
    if (inFlight.current || !selected || !choice || changed) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    try {
      await setAppointmentStatus(selected.id, choice.action.status);
      if (!mounted.current) return;
      toast.success(t(choice.action.done));
      setSelectedId(undefined);
      setChoice(undefined);
    } catch (problem) {
      if (mounted.current) setError(describeStatusError(problem));
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const rowActions = (row: Appointment) => (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto min-h-9 whitespace-normal"
        onClick={(event) => showAppointment(event.currentTarget, row)}
      >
        {t("clinicWorkspace.details")}
      </Button>
      {appointmentActions[row.status].map((action) => (
        <Button
          key={action.status}
          type="button"
          size="sm"
          variant={action.danger ? "ghost" : "secondary"}
          className={
            "h-auto min-h-9 whitespace-normal " + (action.danger ? "text-destructive" : "")
          }
          onClick={(event: MouseEvent<HTMLButtonElement>) =>
            showAppointment(event.currentTarget, row, action)
          }
        >
          {t(action.label)}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
        aria-label={t("clinicAppointments.filterLabel")}
      >
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("clinicAppointments.filterLabel")}
        >
          {VIEWS.map(({ value, label }) => (
            <Button
              key={value}
              ref={value === "all" ? filters : undefined}
              variant={view === value ? "default" : "ghost"}
              size="sm"
              className="h-auto min-h-9 whitespace-normal text-start"
              aria-pressed={view === value}
              onClick={() =>
                void navigate({ search: value === "all" ? {} : { view: value }, replace: true })
              }
            >
              {t(label)}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            <span>{t("doctorWorkspace.date")}</span>
            <Input
              type="date"
              className="min-w-0"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className="grid min-w-0 gap-1.5 text-sm font-medium">
            <label htmlFor="clinic-agenda-doctor">{t("clinicAppointments.col.doctor")}</label>
            <NativeSelect
              id="clinic-agenda-doctor"
              value={doctor}
              onChange={(event) => setDoctor(event.target.value)}
            >
              <option value="">{t("clinicCalendar.allDoctors")}</option>
              {doctorIds.map((id) => (
                <option key={id} value={id}>
                  {doctorName(id)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid min-w-0 gap-1.5 text-sm font-medium">
            <label htmlFor="clinic-agenda-status">{t("common.status")}</label>
            <NativeSelect
              id="clinic-agenda-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as AppointmentStatus | "")}
            >
              <option value="">{t("clinicAppointments.filter.all")}</option>
              {STATUSES.map((state) => (
                <option key={state} value={state}>
                  {t(("status." + state) as MessageKey)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </section>

      {!rows.length ? (
        <div className="surface-card">
          <EmptyState icon={CalendarDays} title={t("clinicAppointments.none")} />
          {date || doctor || status ? (
            <div className="flex justify-center px-4 pb-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDate("");
                  setDoctor("");
                  setStatus("");
                }}
              >
                <SlidersHorizontal aria-hidden /> {t("clinicWorkspace.clearFilters")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="surface-card space-y-2.5 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p dir="auto" className="font-semibold [overflow-wrap:anywhere]">
                    {patientName(row)}
                  </p>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-muted-foreground">
                  {fmt.shortDate(row.date)} · {fmt.timeIst(row.time)} ·{" "}
                  <bdi>{doctorName(row.doctorId)}</bdi>
                </p>
                {rowActions(row)}
              </li>
            ))}
          </ul>
          <div className="surface-card hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-start text-sm [overflow-wrap:anywhere]">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  {(["patient", "dateTime", "doctor", "status", "actions"] as const).map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={col === "actions" ? "w-[29%] p-3 text-start" : "p-3 text-start"}
                    >
                      {t(("clinicAppointments.col." + col) as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="p-3 font-medium">
                      <bdi>{patientName(row)}</bdi>
                    </td>
                    <td className="p-3">
                      {fmt.shortDate(row.date)}
                      <span className="block text-muted-foreground">{fmt.timeIst(row.time)}</span>
                    </td>
                    <td className="p-3">
                      <bdi>{doctorName(row.doctorId)}</bdi>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="p-3">{rowActions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          showClose={false}
          className="rounded-xl motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (trigger.current?.isConnected ? trigger.current : filters.current)?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {choice ? t(choice.action.label) : t("clinicWorkspace.details")}
            </DialogTitle>
            <DialogDescription>
              {choice ? t("clinicWorkspace.statusReview") : clinicName}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 [overflow-wrap:anywhere]">
              <div>
                <dt className="text-muted-foreground">{t("clinicAppointments.col.patient")}</dt>
                <dd dir="auto" className="font-medium">
                  {patientName(selected)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("clinicAppointments.col.doctor")}</dt>
                <dd dir="auto" className="font-medium">
                  {doctorName(selected.doctorId)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("clinicAppointments.col.dateTime")}</dt>
                <dd className="font-medium">
                  {fmt.shortDate(selected.date)} · {fmt.timeIst(selected.time)}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-muted-foreground">{t("common.status")}</dt>
                <dd>
                  <StatusBadge status={selected.status} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t("clinicAppointments.col.reason")}</dt>
                <dd dir="auto">{selected.reason || t("common.notProvided")}</dd>
              </div>
            </dl>
          ) : null}
          {error || changed || !selected ? (
            <p role="alert" className="text-sm text-destructive">
              {t(error ?? "clinicAppointments.statusChanged")}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={pending} onClick={close}>
              {t("common.cancel")}
            </Button>
            {choice ? (
              <Button
                variant={choice.action.danger ? "destructive" : "default"}
                disabled={pending || changed || !selected}
                onClick={() => void apply()}
                className="h-auto min-h-10 whitespace-normal"
              >
                {t(pending ? "common.saving" : "clinicWorkspace.applyChange")}
              </Button>
            ) : selected ? (
              appointmentActions[selected.status].map((action) => (
                <Button
                  key={action.status}
                  variant={action.danger ? "outline" : "default"}
                  onClick={() => setChoice({ action, previous: selected.status })}
                >
                  {t(action.label)}
                </Button>
              ))
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
