export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

/**
 * Part of the day for a local hour (0-23): morning 05:00-11:59, afternoon 12:00-16:59,
 * evening 17:00-20:59, night 21:00-04:59.
 */
export function dayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
