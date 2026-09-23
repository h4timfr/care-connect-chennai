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
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Malayalam"];

export const SPECIALTIES = [
  { id: "pediatrics", name: "Pediatrics", icon: "baby" },
  { id: "orthopedics", name: "Orthopedics", icon: "bone" },
  { id: "cardiology", name: "Cardiology", icon: "heart" },
  { id: "dermatology", name: "Dermatology", icon: "scan-face" },
  { id: "neurology", name: "Neurology", icon: "brain" },
  { id: "ophthalmology", name: "Ophthalmology", icon: "eye" },
  { id: "dentistry", name: "Dentistry", icon: "smile" },
  { id: "gynaecology", name: "Gynaecology", icon: "user-round" },
  { id: "general_medicine", name: "General", icon: "stethoscope" },
];

export const specialties: Record<string, string> = {
  pediatrics: "Pediatrics",
  orthopedics: "Orthopedics",
  cardiology: "Cardiology",
  dermatology: "Dermatology",
  neurology: "Neurology",
  ophthalmology: "Ophthalmology",
  dentistry: "Dentistry",
  gynaecology: "Gynaecology",
  general_medicine: "General Medicine",
};

export function specialtyName(id: string) {
  if (!id) return "";
  return specialties[id] || id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function longDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
}

export function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
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
    timeZone: "Asia/Kolkata",
  });
}


