import { useApp } from "@/lib/store";
import { useDoctorAvailability } from "@/lib/supabase/queries";
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
  const app = useApp();
  const availabilityQuery = useDoctorAvailability(doctorId, date);
  const availableSlots = availabilityQuery.data || [];

  const generateSlots = () => {
    const schedule = app.scheduleOf(doctorId);
    if (!schedule) return [];
    
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDate = new Date(`${date}T00:00:00`);
    const dayName = dayNames[selectedDate.getDay()];
    if (dayName === undefined || !schedule.workingDays.includes(dayName)) return [];
    
    if (schedule.unavailableDates.includes(date)) return [];

    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const fmt = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    
    const out = [];
    const start = toMin(schedule.workingHours.start);
    const end = toMin(schedule.workingHours.end);
    const bStart = toMin(schedule.breakPeriod.start);
    const bEnd = toMin(schedule.breakPeriod.end);
    
    for (let t = start; t < end; t += schedule.slotMinutes) {
      if (t >= bStart && t < bEnd) continue;
      const timeStr = fmt(t) + ":00";
      // It is booked if it's NOT in the availableSlots list (from the RPC)
      // and availabilityQuery has finished loading
      const isBooked = !availabilityQuery.isPending && !availableSlots.includes(timeStr);
      
      out.push({ time: timeStr, booked: isBooked });
    }
    return out;
  };
  const slots = generateSlots();

  if (availabilityQuery.isPending) {
    return <p className="text-sm text-muted-foreground text-center py-4">Checking availability...</p>;
  }

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

