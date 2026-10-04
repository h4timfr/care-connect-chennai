import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import { codeOf, describeDataError, isNetworkError, messageOf } from "./errors";
import type { Database } from "@/lib/database.types";
import { isoDate } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";

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
    status: a.status,
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
      return data.map((a) => mapAppointment(a, a.patients?.full_name ?? ""));
    },
  });
}

/** Maps the booking RPC's validation exceptions to messages a patient can act on. */
export function describeBookingError(error: unknown): MessageKey {
  if (isNetworkError(error)) return describeDataError(error);
  const message = messageOf(error);
  const code = codeOf(error);

  if (code === "23505" || /no longer available|not available|overlap/i.test(message)) {
    return "bookingError.slotTaken";
  }
  if (/not currently active or verified/i.test(message)) return "bookingError.notBookable";
  if (/in the past/i.test(message)) return "bookingError.past";
  if (/horizon exceeds/i.test(message)) return "bookingError.horizon";
  if (/exceeds 500 characters/i.test(message)) return "bookingError.reasonTooLong";
  if (/Rate Limit Exceeded/i.test(message)) return "bookingError.rateLimit";
  if (/Only registered patients/i.test(message)) return "bookingError.notPatient";
  if (code || message) return describeDataError(error);
  return "bookingError.generic";
}

/** Booking failures after which the chosen time should be cleared. */
export const SLOT_GONE_ERRORS: readonly MessageKey[] = [
  "bookingError.slotTaken",
  "bookingError.past",
];

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
    onSuccess: (appointment) => {
      // Add the row the RPC returned to a cached list right away, so the appointment page we
      // navigate to doesn't report it missing while the list revalidates.
      queryClient.setQueryData<Appointment[]>(
        ["appointments", "patient", appointment.patientId],
        (previous) =>
          previous ? [appointment, ...previous.filter((a) => a.id !== appointment.id)] : previous,
      );
    },
    onSettled: (_data, _error, request) => {
      // Success or failure, the slot grid for this doctor/date may be stale now.
      queryClient.invalidateQueries({ queryKey: ["availability", request.doctorId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

/** True once the appointment's date (in India) is before today. */
export function isPastAppointment(appointment: Appointment) {
  return appointment.date < isoDate(new Date());
}

/**
 * Patients may cancel pending or confirmed visits (as the check_appointment_update trigger
 * allows), but only while the visit is still ahead of them.
 */
export function isCancellable(appointment: Appointment) {
  return (
    (appointment.status === "pending" || appointment.status === "confirmed") &&
    !isPastAppointment(appointment)
  );
}

export function describeCancelError(error: unknown): MessageKey {
  const message = messageOf(error);
  if (/terminal|only cancel/i.test(message)) return "appointment.cannotCancel";
  return describeDataError(error);
}

/** Messages for clinic-side status changes rejected by the check_appointment_update trigger. */
export function describeStatusError(error: unknown): MessageKey {
  const message = messageOf(error);
  if (/Terminal states|can only be|cannot/i.test(message)) {
    return "clinicAppointments.statusChanged";
  }
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      // Declining or cancelling frees the slot; confirming changes nothing for others, but the
      // slot grid reflects every active status, so refresh it either way.
      queryClient.invalidateQueries({ queryKey: ["availability", data.doctor_id] });
    },
  });
}
