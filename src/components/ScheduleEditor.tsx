import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { FormAlert } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n";
import { codeOf, describeDataError, messageOf } from "@/lib/supabase/errors";
import {
  scheduleHasBookableWindow,
  useDeleteSchedule,
  useSaveSchedule,
  type Schedule,
} from "@/lib/supabase/providers";

/*
 * Opening-hours editor shared by the clinic portal (Doctors) and the doctor portal (Schedule).
 * The database decides who may write: clinic members or the doctor, and only for a link that is
 * verified and active (migrations 00054 / 00055).
 */

function scheduleError(problem: unknown) {
  if (codeOf(problem) === "42501") return "schedule.notAllowed";
  if (messageOf(problem).includes("A schedule with future active appointments cannot be changed"))
    return "doctorWorkspace.scheduleLocked";
  return describeDataError(problem);
}

export function ScheduleRow({
  schedule: s,
  clinicId,
  editable,
}: {
  schedule: Schedule;
  clinicId: string;
  editable: boolean;
}) {
  const { t, fmt } = useI18n();
  const remove = useDeleteSchedule();
  const [removed, setRemoved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const deleted = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
      <span>
        <span className="font-medium">{fmt.weekday(s.dayOfWeek)}</span>{" "}
        <span dir="ltr">
          {fmt.time(s.startTime)} – {fmt.time(s.endTime)}
        </span>{" "}
        <span className="text-muted-foreground">
          · {t("schedule.slotLength", { minutes: fmt.number(s.slotMinutes) })}
        </span>
      </span>
      {editable ? (
        <Dialog
          open={confirming}
          onOpenChange={(open) => {
            if (inFlight.current || deleted.current) return;
            setConfirming(open);
            setError("");
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              aria-label={t("schedule.remove", { day: fmt.weekday(s.dayOfWeek) })}
              disabled={remove.isPending || removed}
            >
              <Trash2 aria-hidden />
            </Button>
          </DialogTrigger>
          <DialogContent
            showClose={false}
            className="rounded-xl motion-reduce:animate-none"
            onEscapeKeyDown={(event) => {
              if (remove.isPending) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (remove.isPending) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("schedule.remove", { day: fmt.weekday(s.dayOfWeek) })}</DialogTitle>
              <DialogDescription>{t("doctorWorkspace.removeHoursBody")}</DialogDescription>
            </DialogHeader>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  setConfirming(false);
                  setError("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending || removed}
                className="h-auto min-h-10 whitespace-normal"
                onClick={async () => {
                  if (inFlight.current || deleted.current) return;
                  inFlight.current = true;
                  setError("");
                  try {
                    await remove.mutateAsync({ id: s.id, clinicId, doctorId: s.doctorId });
                    deleted.current = true;
                    if (mounted.current) {
                      setRemoved(true);
                      setConfirming(false);
                      toast.success(t("schedule.removed"));
                    }
                  } catch (problem) {
                    if (mounted.current) setError(t(scheduleError(problem)));
                  } finally {
                    inFlight.current = false;
                  }
                }}
              >
                {remove.isPending ? t("common.saving") : t("clinicWorkspace.removeHours")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  );
}

const SLOT_CHOICES = [10, 15, 20, 30, 45, 60];

export function ScheduleForm({
  clinicId,
  doctorId,
  existing,
  disabled = false,
}: {
  clinicId: string;
  doctorId: string;
  existing: Schedule[];
  disabled?: boolean;
}) {
  const { t, fmt } = useI18n();
  const save = useSaveSchedule();
  const [day, setDay] = useState(1);
  const current = existing.find((s) => s.dayOfWeek === day);
  const [start, setStart] = useState(current?.startTime ?? "09:00");
  const [end, setEnd] = useState(current?.endTime ?? "13:00");
  const [slot, setSlot] = useState(current?.slotMinutes ?? 30);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (disabled || inFlight.current) return;
    if (!start || !end || start >= end) {
      setError(t("schedule.invalidWindow"));
      return;
    }
    if (!scheduleHasBookableWindow(start, end, slot)) {
      setError(t("doctorWorkspace.slotTooLong"));
      return;
    }
    setError(null);
    inFlight.current = true;
    try {
      await save.mutateAsync({
        clinicId,
        doctorId,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        slotMinutes: slot,
      });
      if (mounted.current) toast.success(t("schedule.saved", { day: fmt.weekday(day) }));
    } catch (err) {
      if (mounted.current) setError(t(scheduleError(err)));
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-3 rounded-xl border bg-muted/25 p-3">
      <fieldset disabled={disabled || save.isPending} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 min-w-0 space-y-1.5">
          <Label htmlFor={`day-${doctorId}`}>{t("schedule.day")}</Label>
          <NativeSelect
            id={`day-${doctorId}`}
            value={day}
            onChange={(e) => {
              const value = Number(e.target.value);
              const schedule = existing.find((entry) => entry.dayOfWeek === value);
              setDay(value);
              setStart(schedule?.startTime ?? "09:00");
              setEnd(schedule?.endTime ?? "13:00");
              setSlot(schedule?.slotMinutes ?? 30);
              setError(null);
            }}
          >
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {fmt.weekday(d)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`start-${doctorId}`}>{t("schedule.start")}</Label>
          <Input
            id={`start-${doctorId}`}
            type="time"
            className="min-w-0 px-2"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`end-${doctorId}`}>{t("schedule.end")}</Label>
          <Input
            id={`end-${doctorId}`}
            type="time"
            className="min-w-0 px-2"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="col-span-2 min-w-0 space-y-1.5">
          <Label htmlFor={`slot-${doctorId}`}>{t("schedule.slot")}</Label>
          <NativeSelect
            id={`slot-${doctorId}`}
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
          >
            {[...new Set([...SLOT_CHOICES, slot])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {t("schedule.minutes", { minutes: fmt.number(m) })}
                </option>
              ))}
          </NativeSelect>
        </div>
      </fieldset>
      {current ? (
        <p className="text-xs text-muted-foreground">
          {t("schedule.replaces", { day: fmt.weekday(day) })}
        </p>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" size="sm" disabled={disabled || save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {t("schedule.save")}
      </Button>
    </form>
  );
}
