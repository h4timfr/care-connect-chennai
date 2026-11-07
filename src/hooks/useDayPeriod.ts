import { useSyncExternalStore } from "react";
import { dayPeriod, type DayPeriod } from "@/lib/greeting";

const CHECK_INTERVAL_MS = 60 * 1000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, CHECK_INTERVAL_MS);
  return () => window.clearInterval(id);
}

const current = () => dayPeriod(new Date().getHours());

/**
 * The part of the day on the viewer's own clock (their browser's time zone), re-checked every
 * minute so an open tab moves from "evening" to "night". Null while server rendering, where the
 * viewer's time zone isn't known.
 */
export function useDayPeriod(): DayPeriod | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
