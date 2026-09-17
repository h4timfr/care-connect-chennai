import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Appointment, AppointmentStatus } from "@/lib/types";

// Note: This service represents the real Supabase implementation of Appointments.
// It maps the Postgres rows back to the frontend types.

export function usePatientAppointments(patientId?: string) {
  return useQuery({
    queryKey: ["appointments", "patient", patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          doctors ( name ),
          clinics ( name )
        `)
        .eq("patient_id", patientId)
        .order("date", { ascending: false });

      if (error) throw error;
      
      // Map to frontend type
      return data.map((a: any) => ({
        id: a.id,
        doctorId: a.doctor_id,
        clinicId: a.clinic_id,
        patientId: a.patient_id,
        patientName: "You", // Derived in UI or from patient table
        patientPhone: "",
        date: a.date,
        time: a.time,
        reason: a.reason,
        status: a.status as AppointmentStatus,
        fee: Number(a.fee),
        createdAt: a.created_at,
      })) as Appointment[];
    },
    enabled: !!patientId,
  });
}

export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<Appointment, "id" | "createdAt" | "status">) => {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          patient_id: input.patientId,
          doctor_id: input.doctorId,
          clinic_id: input.clinicId,
          date: input.date,
          time: input.time,
          reason: input.reason,
          fee: input.fee,
          status: "pending"
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation for double booking
        if (error.code === '23505' || error.message.includes('unique constraint')) {
          throw new Error("That appointment slot is no longer available.");
        }
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["appointments", "patient", variables.patientId] });
    },
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appointments", "patient", data.patient_id] });
    },
  });
}
