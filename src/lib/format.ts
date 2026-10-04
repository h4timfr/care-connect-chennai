/** tel: link for a stored phone number: digits and a leading + only, or null if unusable. */
export function telHref(phone: string): string | null {
  const digits = phone
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
  return /\d{3,}/.test(digits) ? `tel:${digits}` : null;
}

/** mailto: link for a stored address, or null; extra mailto parameters can't be smuggled in. */
export function mailtoHref(email: string): string | null {
  const address = email.trim();
  return /^[^\s@?&#/\\:]+@[^\s@?&#/\\:]+\.[^\s@?&#/\\:]+$/.test(address)
    ? `mailto:${encodeURIComponent(address).replace("%40", "@")}`
    : null;
}

/** "1 doctor", "3 doctors". */
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

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
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export interface SpecialtyInfo {
  id: string;
  name: string;
  /** Key into the icon map in components/common.tsx */
  icon: string;
  /** Lower-case words patients use when searching for this specialty. */
  keywords: string[];
}

// Keyed by the `specialty_id` / `specialty_ids` values stored in the database.
export const SPECIALTIES: SpecialtyInfo[] = [
  {
    id: "general",
    name: "General Medicine",
    icon: "Stethoscope",
    keywords: ["general", "physician", "family", "gp"],
  },
  {
    id: "pediatrics",
    name: "Pediatrics",
    icon: "Baby",
    keywords: ["pediatric", "paediatric", "child", "children", "kids"],
  },
  {
    id: "orthopedics",
    name: "Orthopedics",
    icon: "Bone",
    keywords: ["ortho", "orthopaedic", "bone", "joint"],
  },
  {
    id: "cardiology",
    name: "Cardiology",
    icon: "HeartPulse",
    keywords: ["cardio", "cardiac", "heart"],
  },
  {
    id: "dermatology",
    name: "Dermatology",
    icon: "Sparkles",
    keywords: ["derma", "skin"],
  },
  {
    id: "gynecology",
    name: "Gynaecology",
    icon: "Heart",
    keywords: ["gynaec", "gynec", "obstetric", "women"],
  },
  {
    id: "neurology",
    name: "Neurology",
    icon: "Brain",
    keywords: ["neuro"],
  },
  {
    id: "ophthalmology",
    name: "Ophthalmology",
    icon: "Eye",
    keywords: ["ophthalm", "eye", "vision"],
  },
  {
    id: "dentistry",
    name: "Dentistry",
    icon: "Smile",
    keywords: ["dentist", "dental", "teeth", "tooth"],
  },
  {
    id: "ent",
    name: "ENT",
    icon: "Ear",
    keywords: ["ent", "ear", "nose", "throat", "sinus"],
  },
];

const SPECIALTY_BY_ID = new Map(SPECIALTIES.map((s) => [s.id, s]));

export function specialtyInfo(id: string): SpecialtyInfo | undefined {
  return SPECIALTY_BY_ID.get(id);
}

export function specialtyName(id: string) {
  if (!id) return "";
  return (
    SPECIALTY_BY_ID.get(id)?.name ??
    id
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/** Specialty ids a free-text search word refers to, e.g. "pediatrician" -> ["pediatrics"]. */
export function specialtiesMatching(word: string): string[] {
  const w = word.toLowerCase();
  if (w.length < 3) return [];
  return SPECIALTIES.filter(
    (s) =>
      s.id.startsWith(w) ||
      s.name.toLowerCase().startsWith(w) ||
      s.keywords.some((k) => w.startsWith(k) || (w.length >= 4 && k.startsWith(w))),
  ).map((s) => s.id);
}

/** The year is shown only when it differs from the current year in India. */
function needsYear(iso: string) {
  return iso.slice(0, 4) !== isoDate(new Date()).slice(0, 4);
}

export function longDate(iso: string) {
  if (!iso) return "Not set";
  const d = new Date(`${iso}T12:00:00Z`); // use noon UTC to avoid any timezone shifts
  if (isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(needsYear(iso) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** A calendar date without weekday, always with the year (e.g. dates of birth). */
export function fullDate(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(needsYear(iso) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
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
