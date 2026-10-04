import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { describeDataError, isNetworkError } from "./errors";
import type { Database } from "@/lib/database.types";
import type { Appointment, AppointmentStatus } from "@/lib/types";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

function mapAppointment(a: AppointmentRow, patientName: string): Appointment {
  return {
    id: a.id,
    doctorId: a.doctor_id,
    clinicId: a.clinic_id,
    patientId: a.patient_id,
    patientName,
    patientPhone: "",
    date: a.date,
    time: a.time,
    reason: a.reason ?? "",
    status: a.status as AppointmentStatus,
    fee: Number(a.fee),
    createdAt: a.created_at,
  };
}

export function usePatientAppointments(patientId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: (options?.enabled ?? true) && !!patientId,
    queryKey: ["appointments", "patient", patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("patient_id", patientId)
        .order("date", { ascending: false });

      if (error) throw error;
      return data.map((a) => mapAppointment(a, "You"));
    },
  });
}

export function useClinicAppointments(clinicIds: string[], options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["appointments", "clinic", clinicIds],
    enabled: (options?.enabled ?? true) && clinicIds.length > 0,
    queryFn: async () => {
      if (clinicIds.length === 0) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients ( full_name )")
        .in("clinic_id", clinicIds)
        .order("date", { ascending: false });

      if (error) throw error;
      return data.map((a) => mapAppointment(a, a.patients?.full_name || "Unknown patient"));
    },
  });
}

/** Maps the booking RPC's validation exceptions to messages a patient can act on. */
export function describeBookingError(error: unknown): string {
  if (isNetworkError(error)) return describeDataError(error);
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "23505" || /no longer available|not available|overlap/i.test(message)) {
    return "That time slot is no longer available. Please choose another time.";
  }
  if (/not currently active or verified/i.test(message)) {
    return "This doctor isn't accepting online bookings at this clinic right now.";
  }
  if (/in the past/i.test(message))
    return "That time has already passed. Please choose a later slot.";
  if (/horizon exceeds/i.test(message)) return "Appointments can be booked up to 90 days ahead.";
  if (/exceeds 500 characters/i.test(message)) {
    return "Please keep the reason for your visit under 500 characters.";
  }
  if (/Rate Limit Exceeded/i.test(message)) {
    return "You already have 5 upcoming appointments. Please cancel one before booking another.";
  }
  if (/Only registered patients/i.test(message)) {
    return "Only patient accounts can book appointments, and this account has no patient profile.";
  }
  if (code || message) return describeDataError(error);
  return "We couldn't book this appointment. Please try again.";
}

export interface BookingRequest {
  doctorId: string;
  clinicId: string;
  date: string;
  time: string;
  reason: string;
}

export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    // The RPC derives the patient from auth.uid(), looks up the authoritative fee and validates the
    // slot against the clinic schedule, so only the selection is sent from the browser.
    mutationFn: async (request: BookingRequest) => {
      const { data, error } = await supabase.rpc("book_appointment", {
        p_doctor_id: request.doctorId,
        p_clinic_id: request.clinicId,
        p_date: request.date,
        p_time: request.time,
        p_reason: request.reason,
      });
      if (error) throw error;
      return mapAppointment(data, "You");
    },
    onSettled: (_data, _error, request) => {
      // Success or failure, the slot grid for this doctor/date may be stale now.
      queryClient.invalidateQueries({ queryKey: ["availability", request.doctorId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

/** Patients may cancel until the visit starts (mirrors the check_appointment_update trigger). */
export function isCancellable(appointment: Appointment) {
  return appointment.status === "pending" || appointment.status === "confirmed";
}

export function describeCancelError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  if (/terminal|only cancel/i.test(message)) return "This appointment can no longer be cancelled.";
  return describeDataError(error);
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
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["availability", data.doctor_id] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
