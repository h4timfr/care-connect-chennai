import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Database } from "@/lib/database.types";
import { specialtiesMatching } from "@/lib/format";
import type { Clinic, Doctor, Patient } from "@/lib/types";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type DoctorRow = Database["public"]["Tables"]["doctors"]["Row"];
type ClinicDoctorRow = Database["public"]["Tables"]["clinic_doctors"]["Row"];

/** Provider listings change rarely; avoid refetching them on every navigation. */
const CATALOG_STALE_TIME = 5 * 60 * 1000;
/** Upper bound on rows returned by one search request. */
export const SEARCH_RESULT_LIMIT = 100;

const DOCTOR_SELECT = "*, clinic_doctors(clinic_id, active, verification_state)";

function mapClinic(c: ClinicRow): Clinic {
  const openingHours = Array.isArray(c.opening_hours)
    ? (c.opening_hours as Clinic["openingHours"])
    : [];
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    area: c.area ?? "",
    phone: c.phone,
    email: c.email,
    about: c.about ?? "",
    specialtyIds: c.specialty_ids ?? [],
    services: c.services ?? [],
    facilities: c.facilities ?? [],
    languages: c.languages ?? [],
    openingHours,
    feeRange: [Number(c.fee_range?.[0] ?? 0), Number(c.fee_range?.[1] ?? 0)],
    rating: Number(c.rating) || 0,
    reviewCount: c.review_count ?? 0,
    isSample: c.is_demo,
  };
}

type DoctorWithLinks = DoctorRow & {
  clinic_doctors: Pick<ClinicDoctorRow, "clinic_id" | "active" | "verification_state">[] | null;
};

function mapDoctor(d: DoctorWithLinks): Doctor {
  const clinicLinks = (d.clinic_doctors ?? []).map((cd) => ({
    clinicId: cd.clinic_id,
    active: cd.active,
    verified: cd.verification_state === "verified",
  }));
  return {
    id: d.id,
    name: d.name,
    gender: d.gender,
    experienceYears: d.experience_years,
    consultationFee: Number(d.consultation_fee),
    about: d.about ?? "",
    specialtyId: d.specialty_id || "general",
    qualifications: d.qualifications ?? [],
    languages: d.languages ?? [],
    services: d.services ?? [],
    rating: Number(d.rating) || 0,
    reviewCount: d.review_count ?? 0,
    registrationNote: d.registration_note ?? "",
    clinicIds: clinicLinks.filter((l) => l.active).map((l) => l.clinicId),
    clinicLinks,
    isSample: d.is_demo,
  };
}

/** Clinics where this doctor currently accepts online bookings. */
export function bookableClinicIds(doctor: Doctor) {
  return doctor.clinicLinks.filter((l) => l.active && l.verified).map((l) => l.clinicId);
}

export function useClinics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["clinics"],
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("*").order("name");
      if (error) throw error;
      return data.map(mapClinic);
    },
  });
}

export function useDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["doctors"],
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select(DOCTOR_SELECT).order("name");
      if (error) throw error;
      return data.map(mapDoctor);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Search (filtering runs in Postgres via PostgREST; RLS applies as for any other read)
// ---------------------------------------------------------------------------------------------

export type DoctorSort = "name" | "fee_asc" | "fee_desc" | "experience";

export interface DoctorFilters {
  text: string;
  specialtyId: string;
  gender: "any" | "female" | "male";
  language: string;
  /** null = no upper bound */
  maxFee: number | null;
  minExperience: number;
  sort: DoctorSort;
}

export interface ClinicFilters {
  text: string;
  specialtyId: string;
}

const STOP_WORDS = new Set([
  "dr",
  "doctor",
  "doctors",
  "clinic",
  "clinics",
  "near",
  "in",
  "at",
  "the",
  "a",
  "an",
  "for",
  "and",
  "with",
  "me",
  "my",
  "find",
  "chennai",
]);

/**
 * Splits free text into search words. Anything other than letters/digits is dropped, which also
 * keeps user input from being interpreted as PostgREST filter syntax.
 */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
    .slice(0, 5);
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * PostgREST conditions matching `word` at the start of any word in `column` (so "ent" matches
 * "ENT Care" but not "Centre"). Words are letters/digits only, so quoting is safe.
 */
function wordPrefixConditions(column: string, word: string) {
  return [`${column}.ilike."${word}%"`, `${column}.ilike."% ${word}%"`];
}

function startsAnyWord(haystack: string, word: string) {
  return haystack
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .some((part) => part.startsWith(word));
}

/** For each search word, the ids of doctors practising at a clinic whose name or area matches it. */
async function doctorIdsByClinicMatch(words: string[]): Promise<Map<string, string[]>> {
  const byWord = new Map<string, string[]>(words.map((w) => [w, []]));
  if (!words.length) return byWord;

  const { data: clinics, error } = await supabase
    .from("clinics")
    .select("id, name, area")
    .or(
      words
        .flatMap((w) => [...wordPrefixConditions("name", w), ...wordPrefixConditions("area", w)])
        .join(","),
    );
  if (error) throw error;
  if (!clinics.length) return byWord;

  const { data: links, error: linkError } = await supabase
    .from("clinic_doctors")
    .select("clinic_id, doctor_id")
    .eq("active", true)
    .in(
      "clinic_id",
      clinics.map((c) => c.id),
    );
  if (linkError) throw linkError;

  for (const w of words) {
    const clinicIds = new Set(
      clinics.filter((c) => startsAnyWord(`${c.name} ${c.area ?? ""}`, w)).map((c) => c.id),
    );
    byWord.set(w, [
      ...new Set(links.filter((l) => clinicIds.has(l.clinic_id)).map((l) => l.doctor_id)),
    ]);
  }
  return byWord;
}

export function useDoctorSearch(filters: DoctorFilters) {
  return useQuery({
    queryKey: ["doctor-search", filters],
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const words = searchWords(filters.text);
      const clinicMatches = await doctorIdsByClinicMatch(words);

      let query = supabase.from("doctors").select(DOCTOR_SELECT);

      // Every search word has to match somewhere (name, specialty, language, or clinic name/area).
      for (const w of words) {
        const conditions = [...wordPrefixConditions("name", w), `languages.cs.{${capitalize(w)}}`];
        const specialtyIds = specialtiesMatching(w);
        if (specialtyIds.length) conditions.push(`specialty_id.in.(${specialtyIds.join(",")})`);
        const doctorIds = clinicMatches.get(w) ?? [];
        if (doctorIds.length) conditions.push(`id.in.(${doctorIds.join(",")})`);
        query = query.or(conditions.join(","));
      }

      if (filters.specialtyId) query = query.eq("specialty_id", filters.specialtyId);
      if (filters.gender !== "any") query = query.eq("gender", filters.gender);
      if (filters.language) query = query.contains("languages", [filters.language]);
      if (filters.maxFee !== null) query = query.lte("consultation_fee", filters.maxFee);
      if (filters.minExperience > 0) query = query.gte("experience_years", filters.minExperience);

      switch (filters.sort) {
        case "fee_asc":
          query = query.order("consultation_fee", { ascending: true });
          break;
        case "fee_desc":
          query = query.order("consultation_fee", { ascending: false });
          break;
        case "experience":
          query = query.order("experience_years", { ascending: false });
          break;
      }
      query = query.order("name").limit(SEARCH_RESULT_LIMIT);

      const { data, error } = await query;
      if (error) throw error;
      return data.map(mapDoctor);
    },
  });
}

export function useClinicSearch(filters: ClinicFilters) {
  return useQuery({
    queryKey: ["clinic-search", filters],
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase.from("clinics").select("*");
      for (const w of searchWords(filters.text)) {
        const conditions = [
          ...wordPrefixConditions("name", w),
          ...wordPrefixConditions("area", w),
          ...wordPrefixConditions("address", w),
          `languages.cs.{${capitalize(w)}}`,
          ...specialtiesMatching(w).map((id) => `specialty_ids.cs.{${id}}`),
        ];
        query = query.or(conditions.join(","));
      }
      if (filters.specialtyId) query = query.contains("specialty_ids", [filters.specialtyId]);

      const { data, error } = await query.order("name").limit(SEARCH_RESULT_LIMIT);
      if (error) throw error;
      return data.map(mapClinic);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Signed-in user
// ---------------------------------------------------------------------------------------------

export function usePatient(
  userId: string | undefined,
  authEmail: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["patient", userId],
    enabled: (options?.enabled ?? true) && !!userId,
    queryFn: async (): Promise<Patient | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("patients")
        .select("*, user:users(email, phone)")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      // No patients row: the account exists but its profile was never provisioned.
      if (!data) return null;

      const user = Array.isArray(data.user) ? data.user[0] : data.user;
      return {
        id: data.id,
        userId: data.user_id,
        name: data.full_name,
        email: user?.email ?? authEmail ?? "",
        phone: user?.phone ?? "",
        dateOfBirth: data.date_of_birth ?? "",
        gender: data.gender ?? "other",
        preferredLanguage: data.preferred_language ?? "",
        area: data.area ?? "",
        savedDoctorIds: data.saved_doctor_ids ?? [],
        savedClinicIds: data.saved_clinic_ids ?? [],
      };
    },
  });
}

export function useAuthorizedClinics(userId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["authorized_clinics", userId],
    enabled: (options?.enabled ?? true) && !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("clinic_memberships")
        .select("clinic_id, clinics!inner(*)")
        .eq("user_id", userId)
        .eq("active", true);

      if (error) throw error;
      return data.map((row) =>
        mapClinic(Array.isArray(row.clinics) ? row.clinics[0] : row.clinics),
      );
    },
  });
}

export function useToggleSavedDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doctorId: string) => {
      const { data, error } = await supabase.rpc("toggle_saved_doctor", { p_doctor_id: doctorId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient"] }),
  });
}

export function useToggleSavedClinic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clinicId: string) => {
      const { data, error } = await supabase.rpc("toggle_saved_clinic", { p_clinic_id: clinicId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient"] }),
  });
}

export interface SlotAvailability {
  slot_time: string;
  available: boolean;
}

export function useDoctorAvailability(
  doctorId: string,
  clinicId: string,
  date: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["availability", doctorId, clinicId, date],
    enabled: (options?.enabled ?? true) && !!doctorId && !!clinicId && !!date,
    // Slots change as other patients book; always revalidate when the picker is shown again.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_doctor_slots", {
        p_doctor_id: doctorId,
        p_clinic_id: clinicId,
        p_date: date,
      });
      if (error) throw error;
      const slots: SlotAvailability[] = data ?? [];
      return slots;
    },
  });
}
