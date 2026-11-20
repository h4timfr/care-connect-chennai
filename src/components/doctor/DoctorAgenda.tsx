import { useId } from "react";
import { CalendarDays } from "lucide-react";
import { EmptyState, ErrorState, InfoNotice, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import type { DoctorAppointment, useDoctorAppointments } from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";

export function AgendaState({ query }: { query: ReturnType<typeof useDoctorAppointments> }) {
  const { t } = useI18n();
  if (query.isLoading) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">{t("common.loading")}</span>
        {[0, 1].map((row) => (
          <div
            key={row}
            aria-hidden
            className="h-20 rounded-2xl border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (!query.error) return null;
  if (isNotDeployed(query.error)) return <InfoNotice>{t("doctorPortal.notDeployed")}</InfoNotice>;
  return (
    <ErrorState
      title={t("doctorAppointments.loadError")}
      message={t(describeDataError(query.error))}
      onRetry={() => void query.refetch()}
    />
  );
}

export function AgendaSection({
  title,
  items,
  empty,
  compact = false,
}: {
  title: string;
  items: DoctorAppointment[];
  empty: string;
  compact?: boolean;
}) {
  const heading = useId();
  const { t, fmt } = useI18n();
  return (
    <section className="min-w-0" aria-labelledby={heading}>
      <h2 id={heading} className="mb-3 font-display text-lg font-semibold break-words">
        {title}
      </h2>
      {items.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 p-4">
              <div className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold tabular-nums text-primary">
                <bdi>{fmt.time(item.time)}</bdi>
              </div>
              <div className="min-w-[8rem] flex-1 [overflow-wrap:anywhere]">
                <p className="font-semibold">
                  <bdi>{item.patientName || t("common.unknownPatient")}</bdi>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmt.longDate(item.date)} · <bdi>{item.clinicName}</bdi>
                </p>
                {!compact && item.reason ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" dir="auto">
                    {item.reason}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                {!compact ? <AppointmentDetails item={item} /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarDays} title={empty} />
      )}
    </section>
  );
}

function AppointmentDetails({ item }: { item: DoctorAppointment }) {
  const { t, fmt } = useI18n();
  const patient = item.patientName || t("common.unknownPatient");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="min-h-10">
          {t("appointment.viewDetails")}
        </Button>
      </DialogTrigger>
      <DialogContent
        showClose={false}
        className="rounded-2xl motion-reduce:animate-none"
        overlayClassName="motion-reduce:animate-none"
      >
        <DialogTitle className="break-words">{t("appointmentDetails.title")}</DialogTitle>
        <DialogDescription>{t("doctorAppointments.readOnly")}</DialogDescription>
        <div className="space-y-3 text-sm [overflow-wrap:anywhere]">
          <p className="text-base font-semibold">
            <bdi>{patient}</bdi>
          </p>
          <p>
            {fmt.fullDate(item.date)} · <bdi>{fmt.time(item.time)}</bdi>
          </p>
          <p>
            <bdi>{item.clinicName}</bdi>
          </p>
          <StatusBadge status={item.status} />
          {item.reason ? (
            <dl className="rounded-xl bg-muted p-3">
              <dt className="font-medium">{t("doctorAppointments.reason")}</dt>
              <dd className="whitespace-pre-wrap" dir="auto">
                {item.reason}
              </dd>
            </dl>
          ) : null}
        </div>
        <DialogClose asChild>
          <Button variant="outline">{t("schedule.done")}</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
