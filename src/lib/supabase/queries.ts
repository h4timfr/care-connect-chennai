import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// Only the columns the UI shows. In particular doctors.user_id (an auth account id) and other
// internal columns are never requested by these public listings.
const CLINIC_COLUMNS =
  "id, name, address, area, about, specialty_ids, services, facilities, languages, opening_hours, fee_range, rating, review_count, is_demo, clinic_verification_state, is_published, patient_contact_permission, booking_enabled";
const DOCTOR_SELECT =
  "id, name, gender, experience_years, consultation_fee, about, specialty_id, qualifications, languages, services, rating, review_count, registration_note, is_demo, clinic_doctors!inner(clinic_id, active, verification_state, clinics!inner(clinic_verification_state, is_published, patient_contact_permission, booking_enabled))";

function publicDoctorQuery() {
  return supabase
    .from("doctors")
    .select(DOCTOR_SELECT)
    .eq("is_demo", false)
    .eq("clinic_doctors.active", true)
    .eq("clinic_doctors.verification_state", "verified")
    .eq("clinic_doctors.clinics.clinic_verification_state", "verified")
    .eq("clinic_doctors.clinics.is_published", true);
}

type ClinicListRow = Pick<
  ClinicRow,
  | "id"
  | "name"
  | "address"
  | "area"
  | "about"
  | "specialty_ids"
  | "services"
  | "facilities"
  | "languages"
  | "opening_hours"
  | "fee_range"
  | "rating"
  | "review_count"
  | "is_demo"
  | "clinic_verification_state"
  | "is_published"
  | "patient_contact_permission"
  | "booking_enabled"
>;

function mapClinic(
  c: ClinicListRow,
  contact: Pick<Clinic, "phone" | "email"> = { phone: "", email: "" },
): Clinic {
  const openingHours = Array.isArray(c.opening_hours)
    ? (c.opening_hours as Clinic["openingHours"])
    : [];
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    area: c.area ?? "",
    phone: contact.phone,
    email: contact.email,
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
    verificationState:
      c.clinic_verification_state === "verified" || c.clinic_verification_state === "rejected"
        ? c.clinic_verification_state
        : "pending",
    isPublished: c.is_published,
    patientContactPermission:
      c.patient_contact_permission === "granted" || c.patient_contact_permission === "revoked"
        ? c.patient_contact_permission
        : "not_granted",
    bookingEnabled: c.booking_enabled,
  };
}

type DoctorWithLinks = Omit<DoctorRow, "user_id" | "created_at"> & {
  clinic_doctors:
    | (Pick<ClinicDoctorRow, "clinic_id" | "active" | "verification_state"> & {
        clinics:
          | Pick<
              ClinicRow,
              | "clinic_verification_state"
              | "is_published"
              | "patient_contact_permission"
              | "booking_enabled"
            >
          | Pick<
              ClinicRow,
              | "clinic_verification_state"
              | "is_published"
              | "patient_contact_permission"
              | "booking_enabled"
            >[]
          | null;
      })[]
    | null;
};

function mapDoctor(d: DoctorWithLinks): Doctor {
  const clinicLinks = (d.clinic_doctors ?? []).map((cd) => {
    const c = Array.isArray(cd.clinics) ? cd.clinics[0] : cd.clinics;
    return {
      clinicId: cd.clinic_id,
      active: cd.active,
      verified: cd.verification_state === "verified",
      clinicVerified: c?.clinic_verification_state === "verified",
      clinicPublished: c?.is_published ?? false,
      clinicContactPermission:
        c?.patient_contact_permission === "granted" || c?.patient_contact_permission === "revoked"
          ? c.patient_contact_permission
          : "not_granted",
      clinicBookingEnabled: c?.booking_enabled ?? false,
    } as const;
  });
  return {
    id: d.id,
    name: d.name,
    gender: d.gender,
    experienceYears: d.experience_years,
    consultationFee: Number(d.consultation_fee),
    about: d.about ?? "",
    // No specialty recorded stays empty; it is never presented as General Medicine.
    specialtyId: d.specialty_id ?? "",
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
  if (doctor.isSample) return [];
  return doctor.clinicLinks
    .filter(
      (l) =>
        l.active && l.verified && l.clinicVerified && l.clinicPublished && l.clinicBookingEnabled,
    )
    .map((l) => l.clinicId);
}

/** True when CareConnect has verified an active doctor link at this clinic (the booking rule). */
export function clinicHasBookableDoctor(clinicId: string, doctors: Doctor[]) {
  return doctors.some(
    (d) =>
      !d.isSample &&
      d.clinicLinks.some(
        (l) =>
          l.clinicId === clinicId &&
          l.active &&
          l.verified &&
          l.clinicVerified &&
          l.clinicPublished &&
          l.clinicBookingEnabled,
      ),
  );
}

export function clinicCanPatientContact(clinic: Clinic, doctors: Doctor[]) {
  return (
    !clinic.isSample &&
    clinic.verificationState === "verified" &&
    clinic.isPublished &&
    clinic.patientContactPermission === "granted" &&
    doctors.some((d) => doctorCanPatientContact(d, clinic.id))
  );
}

export function doctorCanPatientContact(doctor: Doctor, clinicId?: string) {
  return (
    !doctor.isSample &&
    doctor.clinicLinks.some(
      (l) =>
        (!clinicId || l.clinicId === clinicId) &&
        l.active &&
        l.verified &&
        l.clinicVerified &&
        l.clinicPublished &&
        l.clinicContactPermission === "granted",
    )
  );
}

export function useClinics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["clinics"],
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select(CLINIC_COLUMNS)
        .eq("clinic_verification_state", "verified")
        .eq("is_published", true)
        .eq("is_demo", false)
        .order("name");
      if (error) throw error;
      return data.map((clinic) => mapClinic(clinic));
    },
  });
}

/** Unfiltered clinic rows for the platform-admin review screens; RLS remains authoritative. */
export function useAdminClinics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["admin", "clinics"],
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_clinics");
      if (error) throw error;
      return data.map((clinic) => mapClinic(clinic, { phone: clinic.phone, email: clinic.email }));
    },
  });
}

export function useDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["doctors"],
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await publicDoctorQuery().order("name");
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

/** The already-loaded doctor and clinic listings (the app-wide catalog). */
export interface SearchCatalog {
  clinics: Clinic[];
  doctors: Doctor[];
}

/** True when the filters narrow the doctor list; sorting alone does not. */
export function hasDoctorCriteria(filters: DoctorFilters) {
  return (
    searchWords(filters.text).length > 0 ||
    !!filters.specialtyId ||
    filters.gender !== "any" ||
    !!filters.language ||
    filters.maxFee !== null ||
    filters.minExperience > 0
  );
}

/** True when the filters narrow the clinic list. */
export function hasClinicCriteria(filters: ClinicFilters) {
  return searchWords(filters.text).length > 0 || !!filters.specialtyId;
}

const SORT_KEYS: Record<Exclude<DoctorSort, "name">, (d: Doctor) => number> = {
  fee_asc: (d) => d.consultationFee,
  fee_desc: (d) => -d.consultationFee,
  experience: (d) => -d.experienceYears,
};

/**
 * The unfiltered doctor list in the same order the search query would return it. The catalog is
 * already ordered by name in Postgres, so a stable sort on the sort key reproduces
 * `ORDER BY <key>, name` exactly, with the same row limit.
 */
export function unfilteredDoctors(doctors: Doctor[], sort: DoctorSort): Doctor[] {
  const ordered =
    sort === "name"
      ? doctors
      : [...doctors].sort((a, b) => SORT_KEYS[sort](a) - SORT_KEYS[sort](b));
  return ordered.slice(0, SEARCH_RESULT_LIMIT);
}

/** The unfiltered clinic list, as the clinic search would return it (catalog is name-ordered). */
export function unfilteredClinics(clinics: Clinic[]): Clinic[] {
  return clinics.slice(0, SEARCH_RESULT_LIMIT);
}

/** Same test as the `ilike "w%" OR ilike "% w%"` word-prefix conditions, applied in memory. */
function wordPrefixMatch(value: string | null | undefined, word: string) {
  const v = (value ?? "").toLowerCase();
  return v.startsWith(word) || v.includes(` ${word}`);
}

/**
 * For each search word, the ids of doctors actively practising at a clinic whose name or area
 * matches it. Computed from the loaded catalog (every clinic, plus each doctor's active clinic
 * links), which replaces two sequential requests (clinics, then clinic_doctors) per search.
 */
function doctorIdsByClinicMatch(words: string[], catalog: SearchCatalog): Map<string, string[]> {
  const byWord = new Map<string, string[]>();
  for (const w of words) {
    const clinicIds = new Set(
      catalog.clinics
        .filter(
          (c) =>
            (wordPrefixMatch(c.name, w) || wordPrefixMatch(c.area, w)) &&
            startsAnyWord(`${c.name} ${c.area}`, w),
        )
        .map((c) => c.id),
    );
    byWord.set(
      w,
      catalog.doctors.filter((d) => d.clinicIds.some((id) => clinicIds.has(id))).map((d) => d.id),
    );
  }
  return byWord;
}

/**
 * Filtered doctor search: one request, filtered and ordered in Postgres. Runs only when the
 * filters narrow the list (unfiltered results come from the catalog) and once the catalog is
 * loaded, since clinic name/area matches are resolved against it. While a new search runs, the
 * previous results (or `placeholder`) stay visible.
 */
export function useDoctorSearch(
  filters: DoctorFilters,
  catalog: SearchCatalog | undefined,
  placeholder: Doctor[] | undefined,
) {
  return useQuery({
    queryKey: ["doctor-search", filters],
    enabled: !!catalog && hasDoctorCriteria(filters),
    placeholderData: (previous: Doctor[] | undefined) => previous ?? placeholder,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!catalog) throw new Error("Doctor search ran before the catalog loaded.");
      const words = searchWords(filters.text);
      const clinicMatches = doctorIdsByClinicMatch(words, catalog);

      let query = publicDoctorQuery();

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

/** Filtered clinic search (one request). Unfiltered results come from the catalog instead. */
export function useClinicSearch(filters: ClinicFilters, placeholder: Clinic[] | undefined) {
  return useQuery({
    queryKey: ["clinic-search", filters],
    enabled: hasClinicCriteria(filters),
    placeholderData: (previous: Clinic[] | undefined) => previous ?? placeholder,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("clinics")
        .select(CLINIC_COLUMNS)
        .eq("clinic_verification_state", "verified")
        .eq("is_published", true)
        .eq("is_demo", false);
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
      return data.map((clinic) => mapClinic(clinic));
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
        gender: data.gender,
        preferredLanguage: data.preferred_language ?? "",
        area: data.area ?? "",
        savedDoctorIds: data.saved_doctor_ids ?? [],
        savedClinicIds: data.saved_clinic_ids ?? [],
      };
    },
  });
}

/** A clinic the signed-in user is an active member of, with their role there. */
export interface MemberClinic extends Clinic {
  memberRole: Database["public"]["Enums"]["user_role"];
}

export function useAuthorizedClinics(userId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["authorized_clinics", userId],
    enabled: (options?.enabled ?? true) && !!userId,
    queryFn: async (): Promise<MemberClinic[]> => {
      if (!userId) return [];
      const [{ data, error }, { data: contacts, error: contactsError }] = await Promise.all([
        supabase
          .from("clinic_memberships")
          .select(`clinic_id, role, clinics!inner(${CLINIC_COLUMNS})` as const)
          .eq("user_id", userId)
          .eq("active", true),
        supabase.rpc("get_my_clinic_contacts"),
      ]);

      if (error) throw error;
      if (contactsError) throw contactsError;
      const contactsByClinic = new Map(contacts.map((contact) => [contact.clinic_id, contact]));
      return data
        .map((row) => ({
          ...mapClinic(
            Array.isArray(row.clinics) ? row.clinics[0] : row.clinics,
            contactsByClinic.get(row.clinic_id) ?? { phone: "", email: "" },
          ),
          memberRole: row.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Personal details a patient may edit on their own `patients` row (patients_update_self). */
export interface PatientDetails {
  fullName: string;
  dateOfBirth: string | null;
  gender: "male" | "female" | "other" | null;
  area: string | null;
  preferredLanguage: string | null;
}

export function useUpdatePatientDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ patientId, details }: { patientId: string; details: PatientDetails }) => {
      const { error } = await supabase
        .from("patients")
        .update({
          full_name: details.fullName,
          date_of_birth: details.dateOfBirth,
          gender: details.gender,
          area: details.area,
          preferred_language: details.preferredLanguage,
        })
        .eq("id", patientId)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["patient"] }),
  });
}

/** Saves only the UI language on the patient's own row, leaving every other detail untouched. */
export function useUpdatePreferredLanguage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ patientId, language }: { patientId: string; language: string }) => {
      const { error } = await supabase
        .from("patients")
        .update({ preferred_language: language })
        .eq("id", patientId)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: (_data, { language }) => {
      queryClient.setQueriesData<Patient | null>({ queryKey: ["patient"] }, (previous) =>
        previous ? { ...previous, preferredLanguage: language } : previous,
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
