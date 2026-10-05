import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n";
import { codeOf, describeDataError } from "@/lib/supabase/errors";
import { useDeleteSchedule, useSaveSchedule, type Schedule } from "@/lib/supabase/providers";

/*
 * Opening-hours editor shared by the clinic portal (Doctors) and the doctor portal (Schedule).
 * The database decides who may write: clinic members or the doctor, and only for a link that is
 * verified and active (migrations 00054 / 00055).
 */

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
        <Button
          size="sm"
          variant="ghost"
          aria-label={t("schedule.remove", { day: fmt.weekday(s.dayOfWeek) })}
          disabled={remove.isPending}
          onClick={async () => {
            try {
              await remove.mutateAsync({ id: s.id, clinicId, doctorId: s.doctorId });
              toast.success(t("schedule.removed"));
            } catch (err) {
              toast.error(t(describeDataError(err)));
            }
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

const SLOT_CHOICES = [10, 15, 20, 30, 45, 60];

export function ScheduleForm({
  clinicId,
  doctorId,
  existing,
}: {
  clinicId: string;
  doctorId: string;
  existing: Schedule[];
}) {
  const { t, fmt } = useI18n();
  const save = useSaveSchedule();
  const [day, setDay] = useState(1);
  const current = existing.find((s) => s.dayOfWeek === day);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [slot, setSlot] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!start || !end || start >= end) {
      setError(t("schedule.invalidWindow"));
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        clinicId,
        doctorId,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        slotMinutes: slot,
      });
      toast.success(t("schedule.saved", { day: fmt.weekday(day) }));
    } catch (err) {
      setError(codeOf(err) === "42501" ? t("schedule.notAllowed") : t(describeDataError(err)));
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-3 space-y-3 rounded-xl border border-dashed p-3"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor={`day-${doctorId}`}>{t("schedule.day")}</Label>
          <NativeSelect
            id={`day-${doctorId}`}
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {fmt.weekday(d)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`start-${doctorId}`}>{t("schedule.start")}</Label>
          <Input
            id={`start-${doctorId}`}
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`end-${doctorId}`}>{t("schedule.end")}</Label>
          <Input
            id={`end-${doctorId}`}
            type="time"
            step={300}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor={`slot-${doctorId}`}>{t("schedule.slot")}</Label>
          <NativeSelect
            id={`slot-${doctorId}`}
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
          >
            {SLOT_CHOICES.map((m) => (
              <option key={m} value={m}>
                {t("schedule.minutes", { minutes: fmt.number(m) })}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {current ? (
        <p className="text-xs text-muted-foreground">
          {t("schedule.replaces", { day: fmt.weekday(day) })}
        </p>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" size="sm" disabled={save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {t("schedule.save")}
      </Button>
    </form>
  );
}
