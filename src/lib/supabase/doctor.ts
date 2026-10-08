import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { useAuth } from "./auth";
import type { Database } from "@/lib/database.types";
import type { MessageKey } from "@/lib/i18n";
import type { AppointmentStatus } from "@/lib/types";
import { toVerificationState, type VerificationState } from "./providers";

/*
 * Doctor portal (migration 00055). An account is a doctor only when CareConnect has linked it to a
 * doctors row (doctors.user_id), which only a platform admin can do. Every read and write here is
 * authorised by RLS or a SECURITY DEFINER function scoped to auth.uid(); nothing the browser holds
 * (URL, storage, React state) can widen it.
 */

export interface MyDoctor {
  id: string;
  name: string;
  specialtyId: string;
  about: string;
  languages: string[];
  qualifications: string[];
  experienceYears: number;
  consultationFee: number;
  registrationNote: string;
  links: {
    clinicId: string;
    clinicName: string;
    /** clinic_doctors.verification_state, unchanged (pending / verified / rejected). */
    state: VerificationState;
    verified: boolean;
    active: boolean;
  }[];
}

/** The doctor profile linked to this account, or null when the account is not a doctor. */
export function useMyDoctor(userId: string | undefined) {
  return useQuery({
    queryKey: ["my_doctor", userId],
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<MyDoctor | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, name, specialty_id, about, languages, qualifications, experience_years, consultation_fee, registration_note, clinic_doctors(clinic_id, active, verification_state, clinics(name))",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const links = (data.clinic_doctors ?? []) as unknown as {
        clinic_id: string;
        active: boolean;
        verification_state: string;
        clinics: { name: string } | null;
      }[];
      return {
        id: data.id,
        name: data.name,
        specialtyId: data.specialty_id ?? "",
        about: data.about ?? "",
        languages: data.languages ?? [],
        qualifications: data.qualifications ?? [],
        experienceYears: data.experience_years,
        consultationFee: Number(data.consultation_fee),
        registrationNote: data.registration_note ?? "",
        links: links.map((l) => ({
          clinicId: l.clinic_id,
          clinicName: l.clinics?.name ?? "",
          state: toVerificationState(l.verification_state),
          verified: l.verification_state === "verified",
          active: l.active,
        })),
      };
    },
  });
}

export interface DoctorAppointment {
  id: string;
  clinicId: string;
  clinicName: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  reason: string;
  patientName: string;
}

export function useDoctorAppointments(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["doctor_appointments", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: async (): Promise<DoctorAppointment[]> => {
      const { data, error } = await supabase.rpc("doctor_appointments");
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id,
        clinicId: a.clinic_id,
        clinicName: a.clinic_name,
        date: a.date,
        time: a.time.slice(0, 5),
        status: a.status,
        reason: a.reason ?? "",
        patientName: a.patient_name,
      }));
    },
  });
}

export interface DoctorMessage {
  id: string;
  body: string;
  sentAt: string;
  from: "you" | "patient" | "clinic";
}

export interface DoctorConversation {
  id: string;
  clinicId: string;
  clinicName: string;
  patientName: string;
  messages: DoctorMessage[];
}

export function useDoctorConversations(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["doctor_conversations", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: async (): Promise<DoctorConversation[]> => {
      const { data, error } = await supabase.rpc("doctor_conversations");
      if (error) throw error;
      return (data ?? []).map((c) => {
        const raw = Array.isArray(c.messages) ? c.messages : [];
        return {
          id: c.id,
          clinicId: c.clinic_id,
          clinicName: c.clinic_name,
          patientName: c.patient_name,
          messages: raw.map((m) => {
            const row = (m ?? {}) as Record<string, unknown>;
            const from = row["from"];
            return {
              id: String(row["id"] ?? ""),
              body: String(row["body"] ?? ""),
              sentAt: String(row["created_at"] ?? ""),
              from: from === "you" || from === "patient" ? from : "clinic",
            };
          }),
        };
      });
    },
  });
}

/** Posts as the signed-in doctor; msg_insert_doctor checks the conversation and sender. */
export function useDoctorReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversationId: string; senderId: string; body: string }) => {
      // No .select(): doctors have no read policy on messages (replies come back through
      // doctor_conversations), so the insert returns nothing on success.
      const { error } = await supabase.from("messages").insert({
        conversation_id: args.conversationId,
        sender_id: args.senderId,
        body: args.body,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["doctor_conversations"] }),
  });
}

export interface DoctorProfileUpdate {
  about: string;
  languages: string[];
  qualifications: string[];
  experienceYears: number;
  consultationFee: number;
}

export function useUpdateMyDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { doctorId: string; update: DoctorProfileUpdate }) => {
      const { error } = await supabase
        .from("doctors")
        .update({
          about: args.update.about.trim() || null,
          languages: args.update.languages,
          qualifications: args.update.qualifications,
          experience_years: args.update.experienceYears,
          consultation_fee: args.update.consultationFee,
        })
        .eq("id", args.doctorId)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["my_doctor"] });
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
    },
  });
}

// ---- Doctor applications

type DoctorApplicationRow = Database["public"]["Tables"]["doctor_applications"]["Row"];
export type DoctorApplicationInput = Database["public"]["Tables"]["doctor_applications"]["Insert"];
export type DoctorApplicationStatus = DoctorApplicationRow["status"];

export interface DoctorApplication {
  id: string;
  fullName: string;
  specialtyId: string;
  qualifications: string;
  registration: string;
  experienceYears: number;
  consultationFee: number | null;
  clinicId: string | null;
  clinicName: string;
  clinicNote: string;
  contactPhone: string;
  contactEmail: string;
  message: string;
  status: DoctorApplicationStatus;
  reviewNote: string;
  createdAt: string;
}

const DOCTOR_APPLICATION_SELECT = "*, clinic:clinics(name)" as const;

function mapDoctorApplication(
  row: DoctorApplicationRow & { clinic?: { name: string } | { name: string }[] | null },
): DoctorApplication {
  const clinic = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
  return {
    id: row.id,
    fullName: row.full_name,
    specialtyId: row.specialty_id,
    qualifications: row.qualifications,
    registration: `${row.registration_council} ${row.registration_number}`,
    experienceYears: row.experience_years,
    consultationFee: row.consultation_fee === null ? null : Number(row.consultation_fee),
    clinicId: row.clinic_id,
    clinicName: clinic?.name ?? "",
    clinicNote: row.clinic_note ?? "",
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    message: row.message ?? "",
    status: row.status,
    reviewNote: row.review_note ?? "",
    createdAt: row.created_at,
  };
}

export function useMyDoctorApplications(userId: string | undefined) {
  return useQuery({
    queryKey: ["doctor_applications", "mine", userId],
    enabled: !!userId,
    retry: false,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("doctor_applications")
        .select(DOCTOR_APPLICATION_SELECT)
        .eq("applicant_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapDoctorApplication);
    },
  });
}

export function useSubmitDoctorApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DoctorApplicationInput) => {
      const { error } = await supabase
        .from("doctor_applications")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["doctor_applications"] }),
  });
}

export function useDoctorApplicationsForReview(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["doctor_applications", "all", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_applications")
        .select(DOCTOR_APPLICATION_SELECT)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map(mapDoctorApplication);
    },
  });
}

export function useReviewDoctorApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { applicationId: string; approve: boolean; note: string }) => {
      const { data, error } = await supabase.rpc("admin_review_doctor_application", {
        p_application_id: args.applicationId,
        p_approve: args.approve,
        p_note: args.note.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["doctor_applications"] });
      queryClient.invalidateQueries({ queryKey: ["clinic_doctors"] });
    },
  });
}

export const DOCTOR_STATUS_KEY: Record<DoctorApplicationStatus, MessageKey> = {
  submitted: "apply.status.submitted",
  approved: "apply.status.approved",
  rejected: "apply.status.rejected",
  withdrawn: "apply.status.withdrawn",
};
