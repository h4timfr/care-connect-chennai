import { Loader2 } from "lucide-react";
import { useDoctorAvailability } from "@/lib/supabase/queries";
import { describeDataError } from "@/lib/supabase/errors";
import { addDays, dayPartOf, isoDate, longDate, relativeDay, shortDate, to12h } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PARTS = ["morning", "afternoon", "evening"] as const;
const PART_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export function DateStrip({
  value,
  onChange,
  days = 14,
}: {
  value: string;
  onChange: (date: string) => void;
  days?: number;
}) {
  const dates = Array.from({ length: days }, (_, i) => isoDate(addDays(new Date(), i)));
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role="group"
      aria-label="Choose a date"
    >
      {dates.map((date) => {
        const active = date === value;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onChange(date)}
            aria-pressed={active}
            aria-label={longDate(date)}
            className={cn(
              "min-w-20 shrink-0 rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            <span className="block text-xs opacity-80">{relativeDay(date)}</span>
            <span className="block text-sm font-semibold">{shortDate(date)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SlotGrid({
  clinicId,
  doctorId,
  date,
  value,
  onChange,
}: {
  doctorId: string;
  clinicId: string;
  date: string;
  value?: string;
  onChange: (time: string) => void;
}) {
  const availability = useDoctorAvailability(doctorId, clinicId, date);

  if (availability.isPending) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking availability…
      </p>
    );
  }

  if (availability.isError) {
    return (
      <div role="alert" className="rounded-xl border border-dashed px-4 py-6 text-center text-sm">
        <p className="text-muted-foreground">
          Couldn't load available times. {describeDataError(availability.error)}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => availability.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const slots = availability.data;
  if (!slots.length) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No appointments are offered on {longDate(date)}. Please choose another day.
      </p>
    );
  }

  const anyAvailable = slots.some((s) => s.available);

  return (
    <div className="space-y-4">
      {!anyAvailable ? (
        <p className="text-sm text-muted-foreground">
          Every slot on this date is booked or has already passed. Please choose another day.
        </p>
      ) : null}
      {PARTS.map((part) => {
        const partSlots = slots.filter((s) => dayPartOf(s.slot_time) === part);
        if (!partSlots.length) return null;
        return (
          <div key={part} role="group" aria-label={PART_LABEL[part]}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {PART_LABEL[part]}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {partSlots.map((slot) => {
                const selected = value === slot.slot_time;
                return (
                  <button
                    key={slot.slot_time}
                    type="button"
                    disabled={!slot.available}
                    aria-pressed={selected}
                    aria-label={`${to12h(slot.slot_time)}${slot.available ? "" : ", unavailable"}`}
                    onClick={() => onChange(slot.slot_time)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !slot.available &&
                        "cursor-not-allowed bg-muted text-muted-foreground/60 line-through",
                      slot.available &&
                        selected &&
                        "border-primary bg-primary text-primary-foreground",
                      slot.available &&
                        !selected &&
                        "bg-card hover:border-primary hover:text-primary",
                    )}
                  >
                    {to12h(slot.slot_time)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Times are shown in India Standard Time (IST).</p>
    </div>
  );
}
