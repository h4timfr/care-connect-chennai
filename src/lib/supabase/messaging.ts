import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { useAuth } from "./auth";
import { codeOf } from "./errors";
import type { Conversation } from "@/lib/types";

export function useConversations(scope: "patient_id" | "clinic_id", scopeId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !scopeId) return;

    let active = true;
    let refreshing = false;
    let pending = false;
    const queryKey = ["conversations", userId, scope, scopeId] as const;
    const filters = { queryKey, exact: true };
    const refresh = async () => {
      if (!active) return;
      pending = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (active && pending) {
          pending = false;
          // A join or insert can arrive while the initial read is still running. Its
          // response can predate the event, so wait for it and then read again.
          if (queryClient.getQueryState(queryKey)?.fetchStatus === "fetching") {
            await queryClient.refetchQueries(filters, { cancelRefetch: false });
          }
          if (active) await queryClient.invalidateQueries(filters, { cancelRefetch: false });
        }
      } finally {
        refreshing = false;
      }
    };
    // The socket is an invalidation signal. Reads remain scoped and authorized by RLS.
    const channel = supabase
      .channel(`messages:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        // Reconcile messages written between the initial read and a join or reconnect.
        if (status === "SUBSCRIBED") void refresh();
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, scope, scopeId, queryClient]);

  return useQuery({
    queryKey: ["conversations", userId, scope, scopeId],
    enabled: !!userId && !!scopeId,
    // Recover even when a channel appears joined but delivers no change notifications.
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<Conversation[]> => {
      if (!scopeId) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, clinic_id, doctor_id, patient_id, kind, appointment_id, created_at, messages(id, conversation_id, sender_id, body, created_at), patients(full_name, user_id), appointments(date)",
        )
        .eq(scope, scopeId)
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (error) throw error;

      const clinicMetadata =
        scope === "patient_id" && data.length
          ? await readPatientConversationClinics(
              data.map((conversation) => conversation.id),
              signal,
            )
          : undefined;
      // A thread deleted between these two reads will be absent from the owner-scoped lookup.
      return data
        .filter((c) => !clinicMetadata || clinicMetadata.has(c.id))
        .map((c) => ({
          id: c.id,
          clinicId: c.clinic_id,
          doctorId: c.doctor_id ?? undefined,
          patientId: c.patient_id,
          patientName: c.patients?.full_name ?? "",
          kind: c.kind,
          appointmentId: c.appointment_id ?? undefined,
          appointmentDate: c.appointments?.date,
          ...(clinicMetadata && {
            clinicName: clinicMetadata.get(c.id)?.clinic_name,
            clinicUnavailable: clinicMetadata.get(c.id)?.clinic_state === "unavailable",
            canSend: clinicMetadata.get(c.id)?.clinic_state === "open",
          }),
          messages: (c.messages ?? [])
            .map((m) => ({
              id: m.id,
              conversationId: m.conversation_id,
              sender:
                m.sender_id === c.patients?.user_id ? ("patient" as const) : ("clinic" as const),
              body: m.body,
              sentAt: m.created_at,
            }))
            .sort(
              (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
            ),
        }));
    },
  });
}

async function readPatientConversationClinics(conversationIds: string[], signal: AbortSignal) {
  const { data, error } = await supabase
    .rpc("patient_conversation_clinics", { p_conversation_ids: conversationIds })
    .abortSignal(signal);
  if (error) throw error;
  return new Map(data.map((clinic) => [clinic.conversation_id, clinic]));
}

export interface MessageWrite {
  conversationId: string;
  senderId: string;
  body: string;
  messageId: string;
}

async function confirmParticipantMessage({
  conversationId,
  senderId,
  body,
  messageId,
}: MessageWrite) {
  const { data, error } = await supabase
    .from("messages")
    .select("body")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", senderId)
    .maybeSingle();
  if (error) throw error;
  return data?.body === body;
}

export async function writeMessage(
  input: MessageWrite,
  confirmDuplicate = confirmParticipantMessage,
) {
  const { conversationId, senderId, body, messageId } = input;
  const { error } = await supabase.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    body,
  });
  if (!error) return;
  // A retry can encounter a committed primary key if the original response was lost.
  // Confirm the exact authored message through the caller's existing read scope.
  if (codeOf(error) === "23505" && (await confirmDuplicate(input))) return;
  throw error;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MessageWrite) => writeMessage(input),
    onSettled: (_data, error) => {
      if (!error || codeOf(error) === "42501" || codeOf(error) === "23503") {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
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
        let query = supabase
          .from("conversations")
          .select("id")
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId);
        if (appointmentId) {
          query = query.eq("kind", "appointment").eq("appointment_id", appointmentId);
          if (doctorId) query = query.eq("doctor_id", doctorId);
        } else {
          query = query.eq("kind", "general");
        }
        const { data, error } = await query.order("created_at").order("id").limit(1).maybeSingle();
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
        // A concurrent opener won the general or appointment unique key. Reuse only that thread.
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
