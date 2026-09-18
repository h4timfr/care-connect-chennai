/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Conversation, Message } from "@/lib/types";

export function useConversations(userId?: string) {
  return useQuery({
    queryKey: ["conversations", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          messages(*),
          clinics(name),
          patients(full_name)
        `)
        .or(`patient_id.eq.${userId},clinic_id.in.(select clinic_id from clinic_memberships where user_id = '${userId}')`)
        .order("created_at", { ascending: false });
        
      if (error) throw error;
      
      return data.map((c: any) => ({
        id: c.id,
        clinicId: c.clinic_id,
        doctorId: c.doctor_id,
        patientId: c.patient_id,
        patientName: c.patients?.full_name || "Unknown Patient",
        kind: c.kind,
        appointmentId: c.appointment_id,
        unreadForPatient: c.unread_for_patient,
        unreadForClinic: c.unread_for_clinic,
        messages: (c.messages || []).map((m: any) => ({
          id: m.id,
          conversationId: m.conversation_id,
          sender: m.sender_id === c.patient_id ? "patient" : "clinic",
          body: m.body,
          sentAt: m.created_at
        })).sort((a: any, b: any) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
      })) as Conversation[];
    },
    enabled: !!userId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, senderId, body }: { conversationId: string, senderId: string, body: string, isPatient: boolean }) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          body
        })
        .select()
        .single();
        
      if (error) throw error;
      
      // Update unread count
      // We would normally do this in an RPC or trigger, but for now we can do a second update or rely on a DB trigger.
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, side }: { conversationId: string, side: "patient" | "clinic" }) => {
      const column = side === "patient" ? "unread_for_patient" : "unread_for_clinic";
      const { error } = await supabase
        .from("conversations")
        .update({ [column]: 0 })
        .eq("id", conversationId);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
}

export function useEnsureConversation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ clinicId, doctorId, appointmentId, patientId }: { clinicId: string, doctorId?: string, appointmentId?: string, patientId: string }) => {
      // Check if exists
      const { data: existing, error: fetchError } = await supabase
        .from("conversations")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .maybeSingle();
        
      if (fetchError) throw fetchError;
      if (existing) return existing.id;
      
      // Create new
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_id: appointmentId,
          kind: appointmentId ? "appointment" : "general"
        })
        .select()
        .single();
        
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
}
