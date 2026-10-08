import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { useAuth } from "./auth";
import { codeOf } from "./errors";
import type { Conversation } from "@/lib/types";

export function useConversations(patientId?: string, clinicIds: string[] = [], enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const channelId = useId();
  const clinicIdsKey = clinicIds.join(",");
  const active = enabled && !!user && (!!patientId || clinicIds.length > 0);

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
    queryKey: ["conversations", user?.id, patientId, clinicIdsKey],
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
        patientName: c.patients?.full_name ?? "",
        kind: c.kind,
        appointmentId: c.appointment_id ?? undefined,
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
      const findExisting = async () => {
        const { data, error } = await supabase
          .from("conversations")
          .select("id")
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data?.id ?? null;
      };

      const existing = await findExisting();
      if (existing) return existing;

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

      if (error) {
        // Another tab or request created it between the check and the insert; the unique index
        // (patient, clinic) rejected the duplicate, so use the conversation that now exists.
        if (codeOf(error) === "23505") {
          const created = await findExisting();
          if (created) return created;
        }
        throw error;
      }
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
