export const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function to12h(time: string) {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function longDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function relativeDay(iso: string) {
  const today = isoDate(new Date());
  const tomorrow = isoDate(addDays(new Date(), 1));
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return shortDate(iso);
}

export function dayPartOf(time: string): "morning" | "afternoon" | "evening" {
  const h = Number(time.split(":")[0]);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function timeAgo(isoDateTime: string) {
  const diff = Date.now() - new Date(isoDateTime).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function clockTime(isoDateTime: string) {
  return new Date(isoDateTime).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}
