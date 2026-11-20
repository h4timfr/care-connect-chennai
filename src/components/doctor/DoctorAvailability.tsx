import { useId, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { LinkStatus } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DOCTOR_WEEK } from "@/lib/doctor-workspace";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import type { MyDoctor } from "@/lib/supabase/doctor";
import { describeDataError, codeOf, messageOf } from "@/lib/supabase/errors";
import {
  scheduleHasBookableWindow,
  useDeleteSchedule,
  useSaveSchedule,
  type Schedule,
} from "@/lib/supabase/providers";

type ClinicLink = MyDoctor["links"][number];
const SLOT_CHOICES = [10, 15, 20, 30, 45, 60];

export function DoctorAvailability({ me }: { me: MyDoctor }) {
  const { t } = useI18n();
  if (!me.links.length)
    return <EmptyState icon={CalendarClock} title={t("doctorDashboard.noClinics")} />;
  return (
    <div className="space-y-5">
      <InfoNotice>{t("doctorSchedule.note")}</InfoNotice>
      <div className="grid gap-4">
        {me.links.map((link) => (
          <ClinicAvailability key={link.clinicId} doctorId={me.id} link={link} />
        ))}
      </div>
    </div>
  );
}

function ClinicAvailability({ doctorId, link }: { doctorId: string; link: ClinicLink }) {
  const { t } = useI18n();
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2
          id={heading}
          className="min-w-0 font-display text-lg font-semibold [overflow-wrap:anywhere]"
        >
          <bdi>{link.clinicName || t("common.notProvided")}</bdi>
        </h2>
        <LinkStatus state={link.state} active={link.active} />
      </header>
      {link.active && link.verified ? (
        <ClinicEditor doctorId={doctorId} clinicId={link.clinicId} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            link.state === "rejected"
              ? "doctorSchedule.rejected"
              : !link.active && link.verified
                ? "doctorSchedule.inactive"
                : "doctorSchedule.pending",
          )}
        </p>
      )}
    </section>
  );
}

function ClinicEditor({ doctorId, clinicId }: { doctorId: string; clinicId: string }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const query = useQuery({
    // Match the existing schedule mutation invalidation prefix, with a doctor-specific cache key.
    queryKey: ["doctor_schedules", clinicId, user?.id, doctorId],
    enabled: !!user,
    retry: false,
    queryFn: async ({ signal }): Promise<Schedule[]> => {
      const { data, error } = await supabase
        .from("doctor_schedules")
        .select("id, doctor_id, day_of_week, start_time, end_time, slot_minutes")
        .eq("clinic_id", clinicId)
        .eq("doctor_id", doctorId)
        .abortSignal(signal);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        doctorId: row.doctor_id,
        dayOfWeek: row.day_of_week,
        startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5),
        slotMinutes: row.slot_minutes,
      }));
    },
  });
  const save = useSaveSchedule();
  const remove = useDeleteSchedule();
  const working = useRef(false);
  const editTarget = useRef<HTMLSelectElement>(null);
  const id = useId();
  const [day, setDay] = useState(1);
  const [values, setValues] = useState<{ start: string; end: string; slot: number }>();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string }>();
  const [removed, setRemoved] = useState<string[]>([]);
  const items = (query.data ?? []).filter((item) => !removed.includes(item.id));
  const current = items.find((item) => item.dayOfWeek === day);
  const start = values?.start ?? current?.startTime ?? "09:00";
  const end = values?.end ?? current?.endTime ?? "13:00";
  const slot = values?.slot ?? current?.slotMinutes ?? 30;
  const saving = save.isPending || remove.isPending;

  function selectDay(value: number) {
    setDay(value);
    setValues(undefined);
    setFeedback(undefined);
  }

  const fail = (error: unknown) => {
    const locked =
      codeOf(error) === "P0001" &&
      messageOf(error).includes("A schedule with future active appointments cannot be changed");
    setFeedback({
      error: true,
      message: t(
        locked
          ? "doctorWorkspace.scheduleLocked"
          : codeOf(error) === "42501"
            ? "schedule.notAllowed"
            : describeDataError(error),
      ),
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (working.current || !query.isSuccess) return;
    if (!start || !end || start >= end) {
      setFeedback({ error: true, message: t("schedule.invalidWindow") });
      return;
    }
    if (!scheduleHasBookableWindow(start, end, slot)) {
      setFeedback({ error: true, message: t("doctorWorkspace.slotTooLong") });
      return;
    }

    working.current = true;
    setFeedback(undefined);
    try {
      await save.mutateAsync({
        clinicId,
        doctorId,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        slotMinutes: slot,
      });
      setValues(undefined);
      setFeedback({ error: false, message: t("schedule.saved", { day: fmt.weekday(day) }) });
    } catch (error) {
      fail(error);
    } finally {
      working.current = false;
    }
  };

  const deleteHours = async (item: Schedule) => {
    if (working.current || !query.isSuccess) return;
    working.current = true;
    setFeedback(undefined);
    try {
      await remove.mutateAsync({ id: item.id, clinicId, doctorId });
      setRemoved((previous) => [...previous, item.id]);
      editTarget.current?.focus();
      if (day === item.dayOfWeek) setValues(undefined);
      setFeedback({ error: false, message: t("schedule.removed") });
    } catch (error) {
      fail(error);
    } finally {
      working.current = false;
    }
  };

  if (query.isLoading) return <PageLoader label={t("common.loading")} />;
  if (query.error)
    return (
      <ErrorState
        title={t("doctorWorkspace.scheduleLoadError")}
        message={t(describeDataError(query.error))}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
      <form
        onSubmit={submit}
        noValidate
        className="min-w-0 space-y-3 self-start rounded-xl border bg-muted/35 p-3 sm:p-4"
      >
        <h3 className="font-display font-semibold">{t("schedule.edit")}</h3>
        <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={id + "-day"}>{t("schedule.day")}</Label>
            <NativeSelect
              ref={editTarget}
              id={id + "-day"}
              value={day}
              onChange={(e) => selectDay(Number(e.target.value))}
            >
              {DOCTOR_WEEK.map((value) => (
                <option key={value} value={value}>
                  {fmt.weekday(value)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={id + "-length"}>{t("schedule.slot")}</Label>
            <NativeSelect
              id={id + "-length"}
              value={slot}
              onChange={(e) => setValues({ start, end, slot: Number(e.target.value) })}
            >
              {[...new Set([...SLOT_CHOICES, slot])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {t("schedule.minutes", { minutes: fmt.number(n) })}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={id + "-start"}>{t("schedule.start")}</Label>
            <Input
              id={id + "-start"}
              type="time"
              className="min-w-0"
              dir="ltr"
              value={start}
              onChange={(e) => setValues({ start: e.target.value, end, slot })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={id + "-end"}>{t("schedule.end")}</Label>
            <Input
              id={id + "-end"}
              type="time"
              className="min-w-0"
              dir="ltr"
              value={end}
              onChange={(e) => setValues({ start, end: e.target.value, slot })}
            />
          </div>
        </fieldset>
        {current ? (
          <p className="text-xs text-muted-foreground">
            {t("schedule.replaces", { day: fmt.weekday(day) })}
          </p>
        ) : null}
        {feedback ? (
          <p
            role={feedback.error ? "alert" : "status"}
            className={feedback.error ? "text-sm text-destructive" : "text-sm text-primary"}
          >
            {feedback.message}
          </p>
        ) : null}
        <Button type="submit" disabled={saving || !query.isSuccess}>
          {save.isPending ? t("common.saving") : t("schedule.save")}
        </Button>
      </form>
      <ul className="min-w-0 divide-y rounded-xl border" aria-label={t("doctorSchedule.title")}>
        {DOCTOR_WEEK.map((value) => {
          const item = items.find((entry) => entry.dayOfWeek === value);
          const weekday = fmt.weekday(value);
          return (
            <li key={value} className="flex flex-wrap items-center justify-between gap-1 px-3 py-2">
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="text-sm font-medium">{weekday}</p>
                <p className="text-xs text-muted-foreground">
                  {item ? (
                    <>
                      <bdi>
                        {fmt.time(item.startTime)} – {fmt.time(item.endTime)}
                      </bdi>{" "}
                      · {t("schedule.slotLength", { minutes: fmt.number(item.slotMinutes) })}
                    </>
                  ) : (
                    t("doctorWorkspace.noHours")
                  )}
                </p>
              </div>
              {item ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    disabled={saving}
                    aria-label={t("doctorWorkspace.editDay", { day: weekday })}
                    onClick={() => {
                      selectDay(value);
                      editTarget.current?.focus();
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-destructive"
                        disabled={saving}
                        aria-label={t("schedule.remove", { day: weekday })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      showClose={false}
                      className="rounded-2xl motion-reduce:animate-none"
                      overlayClassName="motion-reduce:animate-none"
                    >
                      <DialogTitle>{t("schedule.remove", { day: weekday })}</DialogTitle>
                      <DialogDescription>{t("doctorWorkspace.removeHoursBody")}</DialogDescription>
                      <div className="flex flex-wrap gap-2">
                        <DialogClose asChild>
                          <Button variant="outline">{t("common.cancel")}</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button variant="destructive" onClick={() => void deleteHours(item)}>
                            {t("schedule.remove", { day: weekday })}
                          </Button>
                        </DialogClose>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
