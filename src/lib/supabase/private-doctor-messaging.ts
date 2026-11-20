import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/lib/types";
import { useAuth } from "./auth";
import { supabase } from "./client";
import { codeOf } from "./errors";

export const doctorThreadId = (appointmentId: string) => `doctor:${appointmentId}`;

export function useDoctorMessageEligibility(appointmentId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["doctor-message-eligibility", user?.id, appointmentId],
    enabled: !!user,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("can_message_assigned_doctor", { p_appointment_id: appointmentId }, { get: true })
        .abortSignal(signal);
      if (error && codeOf(error) !== "PGRST202") throw error;
      return data === true;
    },
  });
}

export function useOpenDoctorMessageThread() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const { data, error } = await supabase.rpc("open_doctor_message_thread", {
        p_appointment_id: appointmentId,
      });
      if (error) throw error;
      if (data !== appointmentId) throw new Error("Unexpected doctor thread identifier.");
      return doctorThreadId(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["private-doctor-inbox", user?.id] });
    },
  });
}

export function usePrivateDoctorInbox(asDoctor: boolean, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["private-doctor-inbox", user?.id, asDoctor],
    enabled: enabled && !!user,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("doctor_message_inbox", { p_as_doctor: asDoctor }, { get: true })
        .abortSignal(signal);
      if (error) {
        if (!asDoctor && codeOf(error) === "PGRST202") return [];
        throw error;
      }
      return (data ?? []).map((row) => {
        const id = doctorThreadId(row.appointment_id);
        const messages: Message[] = [];
        if (Array.isArray(row.messages)) {
          for (const message of row.messages) {
            if (!message || typeof message !== "object" || Array.isArray(message)) continue;
            const { id: messageId, body, sender, created_at: sentAt } = message;
            if (
              typeof messageId === "string" &&
              typeof body === "string" &&
              typeof sentAt === "string" &&
              (sender === "doctor" || sender === "patient")
            ) {
              messages.push({ id: messageId, conversationId: id, body, sender, sentAt });
            }
          }
        }
        return {
          id,
          kind: "doctor_appointment" as const,
          appointmentId: row.appointment_id,
          appointmentDate: row.appointment_date,
          clinicId: row.clinic_id,
          clinicName: row.clinic_name,
          patientId: row.patient_id,
          patientName: row.patient_name,
          doctorName: row.doctor_name,
          canSend: row.can_send,
          messages,
        };
      });
    },
  });
}

export function useSendPrivateDoctorMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      body,
      messageId,
    }: {
      appointmentId: string;
      body: string;
      messageId: string;
    }) => {
      const { error } = await supabase.rpc("send_doctor_message", {
        p_appointment_id: appointmentId,
        p_message_id: messageId,
        p_body: body,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["private-doctor-inbox", user?.id] });
    },
  });
}
