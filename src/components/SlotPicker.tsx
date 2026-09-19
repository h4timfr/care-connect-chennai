import { addDays, dayPartOf, isoDate, relativeDay, shortDate, to12h } from "@/lib/format";
import { cn } from "@/lib/utils";

const PARTS = ["morning", "afternoon", "evening"] as const;
const PART_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export function DateStrip({
  value,
  onChange,
  days = 10,
}: {
  value: string;
  onChange: (date: string) => void;
  days?: number;
}) {
  const dates = Array.from({ length: days }, (_, i) => isoDate(addDays(new Date(), i)));
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dates.map((date) => {
        const active = date === value;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onChange(date)}
            aria-pressed={active}
            className={cn(
              "min-w-20 shrink-0 rounded-xl border px-3 py-2 text-center transition-colors",
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
  doctorId,
  date,
  value,
  onChange,
}: {
  doctorId: string;
  date: string;
  value?: string;
  onChange: (time: string) => void;
}) {
  // Generate some available slots since we don't have a schedule engine
  const generateSlots = () => {
    return [
      { time: "09:00:00", booked: false },
      { time: "10:00:00", booked: false },
      { time: "14:00:00", booked: false },
      { time: "16:00:00", booked: false }
    ];
  };
  const slots = generateSlots();

  if (!slots.length) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        The doctor does not consult on this date. Please pick another day.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {PARTS.map((part) => {
        const partSlots = slots.filter((s) => dayPartOf(s.time) === part);
        if (!partSlots.length) return null;
        return (
          <div key={part}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {PART_LABEL[part]}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {partSlots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={slot.booked}
                  aria-pressed={value === slot.time}
                  onClick={() => onChange(slot.time)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                    slot.booked &&
                      "cursor-not-allowed bg-muted text-muted-foreground/50 line-through",
                    !slot.booked &&
                      value === slot.time &&
                      "border-primary bg-primary text-primary-foreground",
                    !slot.booked &&
                      value !== slot.time &&
                      "bg-card hover:border-primary hover:text-primary",
                  )}
                >
                  {to12h(slot.time)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
