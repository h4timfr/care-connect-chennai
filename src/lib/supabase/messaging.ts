import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Conversation } from "@/lib/types";

export function useConversations(patientId?: string, clinicIds: string[] = [], enabled = true) {
  const queryClient = useQueryClient();
  const channelId = useId();
  const clinicIdsKey = clinicIds.join(",");
  const active = enabled && (!!patientId || clinicIds.length > 0);

  useEffect(() => {
    if (!active) return;

    // Realtime respects RLS: only inserts on conversations this user can read are delivered.
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, channelId, queryClient]);

  return useQuery({
    queryKey: ["conversations", patientId, clinicIdsKey],
    enabled: active,
    queryFn: async (): Promise<Conversation[]> => {
      let query = supabase
        .from("conversations")
        .select("*, messages(*), patients(full_name, user_id)");

      if (clinicIds.length > 0 && patientId) {
        query = query.or(`patient_id.eq.${patientId},clinic_id.in.(${clinicIdsKey})`);
      } else if (clinicIds.length > 0) {
        query = query.in("clinic_id", clinicIds);
      } else if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      return data.map((c) => ({
        id: c.id,
        clinicId: c.clinic_id,
        doctorId: c.doctor_id ?? undefined,
        patientId: c.patient_id,
        patientName: c.patients?.full_name || "Unknown patient",
        kind: c.kind,
        appointmentId: c.appointment_id ?? undefined,
        unreadForPatient: c.unread_for_patient,
        unreadForClinic: c.unread_for_clinic,
        messages: (c.messages ?? [])
          .map((m) => ({
            id: m.id,
            conversationId: m.conversation_id,
            sender:
              m.sender_id === c.patients?.user_id ? ("patient" as const) : ("clinic" as const),
            body: m.body,
            sentAt: m.created_at,
          }))
          .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
      }));
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      senderId,
      body,
    }: {
      conversationId: string;
      senderId: string;
      body: string;
    }) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: senderId, body })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      side,
    }: {
      conversationId: string;
      side: "patient" | "clinic";
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update(side === "patient" ? { unread_for_patient: 0 } : { unread_for_clinic: 0 })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useEnsureConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clinicId,
      doctorId,
      appointmentId,
      patientId,
    }: {
      clinicId: string;
      doctorId?: string;
      appointmentId?: string;
      patientId: string;
    }) => {
      const { data: existing, error: fetchError } = await supabase
        .from("conversations")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (existing) return existing.id;

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          doctor_id: doctorId || null,
          appointment_id: appointmentId || null,
          kind: appointmentId ? "appointment" : "general",
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
