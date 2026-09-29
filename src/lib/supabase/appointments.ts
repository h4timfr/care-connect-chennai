/* eslint-disable @typescript-eslint/no-explicit-any -- Documented technical reason: Generic API returns and complex UI component mappings */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Appointment, AppointmentStatus } from "@/lib/types";

// Note: This service represents the real Supabase implementation of Appointments.
// It maps the Postgres rows back to the frontend types.

export function usePatientAppointments(patientId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? !!patientId,
    queryKey: ["appointments", "patient", patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          *,
          doctors ( name ),
          clinics ( name )
        `,
        )
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
  });
}

export function useClinicAppointments(clinicIds: string[], options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["appointments", "clinic", clinicIds],
    queryFn: async () => {
      if (!clinicIds || clinicIds.length === 0) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          *,
          doctors ( name ),
          patients ( full_name )
        `,
        )
        .in("clinic_id", clinicIds)
        .order("date", { ascending: false });

      if (error) throw error;

      // Map to frontend type
      return data.map((a: any) => ({
        id: a.id,
        doctorId: a.doctor_id,
        clinicId: a.clinic_id,
        patientId: a.patient_id,
        patientName: a.patients?.full_name || "Unknown Patient",
        patientPhone: "",
        date: a.date,
        time: a.time,
        reason: a.reason,
        status: a.status as AppointmentStatus,
        fee: Number(a.fee),
        createdAt: a.created_at,
      })) as Appointment[];
    },
    enabled: options?.enabled ?? clinicIds.length > 0,
  });
}

export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointment: Omit<Appointment, "id" | "createdAt">) => {
      // 1. We no longer pass patientId or fee from the frontend; the backend RPC infers it.
      // 2. We call the secure RPC function.
      const { data, error } = await supabase.rpc("book_appointment", {
        p_doctor_id: appointment.doctorId,
        p_clinic_id: appointment.clinicId,
        p_date: appointment.date,
        p_time: appointment.time,
        p_reason: appointment.reason || "",
      });

      if (error) {
        // Handle unique constraint violation for double booking or overlap
        if (
          error.code === "23505" ||
          error.message.includes("unique constraint") ||
          error.message.includes("overlap") ||
          error.message.includes("not available")
        ) {
          throw new Error("That appointment slot is no longer available.");
        }

        // Hide raw database errors from the UI
        console.error("Booking error:", error);
        throw new Error("Failed to book appointment. Please try again or choose another slot.");
      }

      // The RPC returns the new appointment UUID, not a full row.
      // Build a partial Appointment from the input; the full row
      // will be fetched when the appointments query is invalidated.
      return {
        id: data as unknown as string,
        doctorId: appointment.doctorId,
        clinicId: appointment.clinicId,
        patientId: appointment.patientId,
        date: appointment.date,
        time: appointment.time,
        status: "pending",
        reason: appointment.reason || "",
        fee: appointment.fee,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        createdAt: new Date().toISOString(),
      } as Appointment;
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

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      clinicId,
    }: {
      id: string;
      status: AppointmentStatus;
      clinicId: string;
    }) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status })
        .eq("id", id)
        .eq("clinic_id", clinicId) // enforce clinic ownership implicitly
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
