import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Database } from "@/lib/database.types";
import type { MessageKey } from "@/lib/i18n";

/*
 * Provider onboarding and administration (migration 00054). Every call here is authorised by the
 * database — RLS policies and SECURITY DEFINER functions that check clinic_memberships / user_roles.
 * The UI only decides what to show; it never decides who is allowed. Before 00054 is deployed the
 * table and functions do not exist, which callers detect with isNotDeployed() and report honestly.
 */

type ApplicationRow = Database["public"]["Tables"]["provider_applications"]["Row"];
export type ApplicationInput = Database["public"]["Tables"]["provider_applications"]["Insert"];
export type ApplicationStatus = ApplicationRow["status"];
export type ContactRole = ApplicationRow["contact_role"];
export const CONTACT_ROLES: ContactRole[] = [
  "owner",
  "administrator",
  "doctor",
  "manager",
  "other",
];
export const CONTACT_ROLE_LABEL: Record<ContactRole, MessageKey> = {
  owner: "apply.role.owner",
  administrator: "apply.role.administrator",
  doctor: "apply.role.doctor",
  manager: "apply.role.manager",
  other: "apply.role.other",
};

export interface ProviderApplication {
  id: string;
  clinicName: string;
  area: string;
  address: string;
  contactName: string;
  contactRole: ContactRole;
  contactPhone: string;
  contactEmail: string;
  registrationDetails: string;
  doctorCount: number | null;
  message: string;
  status: ApplicationStatus;
  reviewNote: string;
  reviewedAt: string | null;
  clinicId: string | null;
  createdAt: string;
}

function mapApplication(row: ApplicationRow): ProviderApplication {
  return {
    id: row.id,
    clinicName: row.clinic_name,
    area: row.area,
    address: row.address,
    contactName: row.contact_name,
    contactRole: row.contact_role,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    registrationDetails: row.registration_details,
    doctorCount: row.doctor_count,
    message: row.message ?? "",
    status: row.status,
    reviewNote: row.review_note ?? "",
    reviewedAt: row.reviewed_at,
    clinicId: row.clinic_id,
    createdAt: row.created_at,
  };
}

/** Whether the signed-in account holds the platform_admin role (user_roles_read_self). */
export function usePlatformAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ["platform_admin", userId],
    enabled: !!userId,
    // A role lookup that fails must never be retried into a false "yes"; it simply fails closed.
    retry: false,
    queryFn: async (): Promise<boolean> => {
      if (!userId) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "platform_admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

// ---- Applicant

export function useMyApplications(userId: string | undefined) {
  return useQuery({
    queryKey: ["provider_applications", "mine", userId],
    enabled: !!userId,
    retry: false,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("provider_applications")
        .select("*")
        .eq("applicant_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapApplication);
    },
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplicationInput) => {
      const { data, error } = await supabase
        .from("provider_applications")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return mapApplication(data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["provider_applications"] }),
  });
}

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase.rpc("withdraw_provider_application", {
        p_application_id: applicationId,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["provider_applications"] }),
  });
}

// ---- Platform admin

export function useApplicationsForReview(enabled: boolean) {
  return useQuery({
    queryKey: ["provider_applications", "all"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map(mapApplication);
    },
  });
}

export function useReviewApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { applicationId: string; approve: boolean; note: string }) => {
      const { data, error } = await supabase.rpc("admin_review_provider_application", {
        p_application_id: args.applicationId,
        p_approve: args.approve,
        p_note: args.note.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["provider_applications"] });
      queryClient.invalidateQueries({ queryKey: ["clinic_memberships"] });
      queryClient.invalidateQueries({ queryKey: ["clinics"] });
    },
  });
}

export type VerificationState = "pending" | "verified" | "rejected";

export interface DoctorLink {
  clinicId: string;
  clinicName: string;
  doctorId: string;
  doctorName: string;
  specialtyId: string;
  registrationNote: string;
  qualifications: string[];
  state: VerificationState;
  active: boolean;
  isSample: boolean;
}

const LINK_SELECT =
  "clinic_id, doctor_id, active, verification_state, doctors!inner(name, specialty_id, registration_note, qualifications, is_demo), clinics!inner(name)" as const;

type LinkRow = {
  clinic_id: string;
  doctor_id: string;
  active: boolean;
  verification_state: string;
  doctors: {
    name: string;
    specialty_id: string | null;
    registration_note: string | null;
    qualifications: string[] | null;
    is_demo: boolean;
  };
  clinics: { name: string };
};

function mapLink(row: LinkRow): DoctorLink {
  const state = row.verification_state;
  return {
    clinicId: row.clinic_id,
    clinicName: row.clinics.name,
    doctorId: row.doctor_id,
    doctorName: row.doctors.name,
    specialtyId: row.doctors.specialty_id ?? "",
    registrationNote: row.doctors.registration_note ?? "",
    qualifications: row.doctors.qualifications ?? [],
    state: state === "verified" || state === "rejected" ? state : "pending",
    active: row.active,
    isSample: row.doctors.is_demo,
  };
}

/** Doctor–clinic links awaiting a decision. */
export function usePendingDoctorLinks(enabled: boolean) {
  return useQuery({
    queryKey: ["clinic_doctors", "pending"],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_doctors")
        .select(LINK_SELECT)
        .eq("verification_state", "pending")
        .limit(500);
      if (error) throw error;
      return (data as unknown as LinkRow[]).map(mapLink);
    },
  });
}

export function useSetLinkState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { clinicId: string; doctorId: string; state: VerificationState }) => {
      // .single() turns "no row updated" (not permitted by RLS) into an error, never a silent success.
      const { error } = await supabase
        .from("clinic_doctors")
        .update({ verification_state: args.state })
        .eq("clinic_id", args.clinicId)
        .eq("doctor_id", args.doctorId)
        .select("doctor_id")
        .single();
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic_doctors"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    },
  });
}

export interface Membership {
  id: string;
  clinicId: string;
  clinicName: string;
  email: string;
  role: "clinic_staff" | "clinic_admin";
  active: boolean;
}

export function useAllMemberships(enabled: boolean) {
  return useQuery({
    queryKey: ["clinic_memberships", "all"],
    enabled,
    retry: false,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("clinic_memberships")
        .select(
          "id, clinic_id, role, active, user:users!clinic_memberships_user_id_fkey(email), clinic:clinics!clinic_memberships_clinic_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map((row) => {
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        const clinic = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
        return {
          id: row.id,
          clinicId: row.clinic_id,
          clinicName: clinic?.name ?? "",
          email: user?.email ?? "",
          role: row.role === "clinic_admin" ? "clinic_admin" : "clinic_staff",
          active: row.active,
        };
      });
    },
  });
}

export function useAddClinicMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { clinicId: string; email: string; role: Membership["role"] }) => {
      const { error } = await supabase.rpc("admin_add_clinic_member", {
        p_clinic_id: args.clinicId,
        p_email: args.email.trim(),
        p_role: args.role,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["clinic_memberships"] }),
  });
}

export function useSetMembershipActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("clinic_memberships")
        .update({ active: args.active })
        .eq("id", args.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["clinic_memberships"] }),
  });
}

// ---- Clinic portal

/** Every doctor linked to a clinic, including those still awaiting verification. */
export function useClinicDoctorLinks(clinicId: string | undefined) {
  return useQuery({
    queryKey: ["clinic_doctors", "clinic", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("clinic_doctors")
        .select(LINK_SELECT)
        .eq("clinic_id", clinicId);
      if (error) throw error;
      return (data as unknown as LinkRow[])
        .map(mapLink)
        .sort((a, b) => a.doctorName.localeCompare(b.doctorName));
    },
  });
}

export interface DoctorProposal {
  clinicId: string;
  name: string;
  specialtyId: string;
  gender: "male" | "female" | "other" | null;
  experienceYears: number;
  consultationFee: number;
  qualifications: string[];
  languages: string[];
  registrationNote: string;
  about: string;
}

export function useProposeDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: DoctorProposal) => {
      const { data, error } = await supabase.rpc("clinic_propose_doctor", {
        p_clinic_id: p.clinicId,
        p_name: p.name.trim(),
        p_specialty_id: p.specialtyId,
        p_gender: p.gender,
        p_experience_years: p.experienceYears,
        p_consultation_fee: p.consultationFee,
        p_qualifications: p.qualifications,
        p_languages: p.languages,
        p_registration_note: p.registrationNote.trim(),
        p_about: p.about.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["clinic_doctors"] }),
  });
}

export interface Schedule {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export function useClinicSchedules(clinicId: string | undefined) {
  return useQuery({
    queryKey: ["doctor_schedules", clinicId],
    enabled: !!clinicId,
    queryFn: async (): Promise<Schedule[]> => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("doctor_schedules")
        .select("id, doctor_id, day_of_week, start_time, end_time, slot_minutes")
        .eq("clinic_id", clinicId)
        .order("day_of_week");
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        doctorId: r.doctor_id,
        dayOfWeek: r.day_of_week,
        startTime: r.start_time.slice(0, 5),
        endTime: r.end_time.slice(0, 5),
        slotMinutes: r.slot_minutes,
      }));
    },
  });
}

export function useSaveSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (s: {
      clinicId: string;
      doctorId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotMinutes: number;
    }) => {
      // One opening window per doctor, clinic and weekday (a unique constraint in the schema).
      const { error } = await supabase
        .from("doctor_schedules")
        .upsert(
          {
            clinic_id: s.clinicId,
            doctor_id: s.doctorId,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime,
            slot_minutes: s.slotMinutes,
          },
          { onConflict: "doctor_id,clinic_id,day_of_week" },
        )
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: (_d, _e, s) => {
      queryClient.invalidateQueries({ queryKey: ["doctor_schedules", s.clinicId] });
      queryClient.invalidateQueries({ queryKey: ["availability", s.doctorId] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (s: { id: string; clinicId: string; doctorId: string }) => {
      const { error } = await supabase
        .from("doctor_schedules")
        .delete()
        .eq("id", s.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: (_d, _e, s) => {
      queryClient.invalidateQueries({ queryKey: ["doctor_schedules", s.clinicId] });
      queryClient.invalidateQueries({ queryKey: ["availability", s.doctorId] });
    },
  });
}
