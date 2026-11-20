import { isoDate } from "./format";
import { isAppointmentInPast } from "./appointment-time";
import type { DoctorAppointment } from "./supabase/doctor";

export function doctorAgenda(items: DoctorAppointment[], now = new Date()) {
  const today = isoDate(now);
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const upcoming = sorted.filter(
    (item) =>
      item.status !== "cancelled" &&
      item.status !== "completed" &&
      !isAppointmentInPast(item.date, item.time, now),
  );
  const future = new Set(upcoming);
  return {
    today,
    todayItems: sorted.filter((item) => item.date === today),
    todayQueue: upcoming.filter((item) => item.date === today),
    upcoming,
    history: sorted.filter((item) => !future.has(item)).reverse(),
  };
}

export const DOCTOR_WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
