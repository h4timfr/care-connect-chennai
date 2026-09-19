import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CURRENT_PATIENT, CURRENT_CLINIC_ID } from "@/data/constants";
import type {
  Appointment,
  AppointmentStatus,
  Clinic,
  Conversation,
  Doctor,
  DoctorSchedule,
  Patient,
  UserRole,
} from "@/lib/types";

interface BookingInput {
  doctorId: string;
  clinicId: string;
  date: string;
  time: string;
  reason: string;
  patientName: string;
  patientPhone: string;
  fee: number;
}

interface AppState {
  // Auth state now exclusively managed by Supabase AuthProvider
  patient: Patient;
  updatePatient: (patch: Partial<Patient>) => void;

  doctors: Doctor[];
  clinics: Clinic[];
  activeClinic: Clinic;
  doctorById: (id: string) => Doctor | undefined;
  clinicById: (id: string) => Clinic | undefined;
  doctorsOfClinic: (clinicId: string) => Doctor[];
  scheduleOf: (doctorId: string) => DoctorSchedule | undefined;
  schedules: DoctorSchedule[];

  appointments: Appointment[];
  bookAppointment: (input: BookingInput) => Promise<Appointment>;
  cancelAppointment: (id: string) => void;
  rescheduleAppointment: (id: string, date: string, time: string) => void;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => void;

  conversations: Conversation[];
  sendMessage: (conversationId: string, sender: "patient" | "clinic", body: string) => void;
  markRead: (conversationId: string, side: "patient" | "clinic") => void;
  ensureConversation: (args: {
    clinicId: string;
    doctorId?: string;
    appointmentId?: string;
  }) => Promise<string>;

  toggleSavedDoctor: (id: string) => void;
  toggleSavedClinic: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

let counter = 100;
const nextId = (prefix: string) => `${prefix}${++counter}`;

import { useAuth } from "@/lib/supabase/auth";
import {
  usePatientAppointments,
  useBookAppointment,
  useCancelAppointment,
} from "@/lib/supabase/appointments";
import { useClinics, useDoctors, useSchedules } from "@/lib/supabase/queries";

import {
  useConversations,
  useSendMessage,
  useMarkRead,
  useEnsureConversation,
} from "@/lib/supabase/messaging";

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Real Supabase queries
  const patientAppointments = usePatientAppointments(auth.user?.id);
  const clinicsQuery = useClinics();
  const doctorsQuery = useDoctors();
  const schedulesQuery = useSchedules();
  const conversationsQuery = useConversations(auth.user?.id);

  const bookMut = useBookAppointment();
  const cancelMut = useCancelAppointment();
  const sendMsgMut = useSendMessage();
  const markReadMut = useMarkRead();
  const ensureConvMut = useEnsureConversation();

  const hasSupabase = !!import.meta.env.VITE_SUPABASE_URL;

  const [patient, setPatient] = useState<Patient>(CURRENT_PATIENT);
  const clinics = clinicsQuery.data || [];
  const doctors = doctorsQuery.data || [];
  const schedules = schedulesQuery.data || [];
  const appointments = patientAppointments.data || [];
  const conversations = conversationsQuery.data || [];

  const activeClinic = clinics.find((c) => c.id === CURRENT_CLINIC_ID) ?? clinics[0]!;

  const bookAppointment = useCallback(
    async (input: BookingInput) => {
      if (!auth.user) throw new Error("Must be logged in to book");
      await bookMut.mutateAsync({
        doctorId: input.doctorId,
        clinicId: input.clinicId,
        patientId: auth.user.id,
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        date: input.date,
        time: input.time,
        reason: input.reason,
        fee: input.fee,
        status: "pending",
      });
      return { id: "optimistic", status: "pending" } as Appointment;
    },
    [auth.user, bookMut],
  );

  const cancelAppointment = useCallback(
    (id: string) => {
      cancelMut.mutate(id);
    },
    [cancelMut],
  );

  const rescheduleAppointment = useCallback((id: string, date: string, time: string) => {
    // TODO: implement reschedule mutation
  }, []);

  const setAppointmentStatus = useCallback((id: string, status: AppointmentStatus) => {
    // TODO: implement status mutation
  }, []);

  const sendMessage = useCallback(
    (conversationId: string, sender: "patient" | "clinic", body: string) => {
      if (!auth.user) return;
      sendMsgMut.mutate({
        conversationId,
        senderId: auth.user.id,
        body,
        isPatient: sender === "patient",
      });
    },
    [auth.user, sendMsgMut],
  );

  const markRead = useCallback(
    (conversationId: string, side: "patient" | "clinic") => {
      markReadMut.mutate({ conversationId, side });
    },
    [markReadMut],
  );

  const ensureConversation = useCallback(
    async ({
      clinicId,
      doctorId,
      appointmentId,
    }: {
      clinicId: string;
      doctorId?: string;
      appointmentId?: string;
    }) => {
      if (!auth.user) throw new Error("Must be logged in to chat");
      const patientId = auth.user.id;
      const existing = conversations.find(
        (c) => c.clinicId === clinicId && c.patientId === patientId,
      );
      if (existing) return existing.id;

      return ensureConvMut.mutateAsync({
        clinicId,
        patientId,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      });
    },
    [conversations, auth.user, ensureConvMut],
  );

  const value = useMemo<AppState>(
    () => ({
      patient,
      updatePatient: (patch) => setPatient((p) => ({ ...p, ...patch })),
      doctors,
      clinics,
      activeClinic,
      doctorById: (id: string) => doctors.find((d) => d.id === id),
      clinicById: (id: string) => clinics.find((c) => c.id === id),
      doctorsOfClinic: (clinicId: string) => doctors.filter((d) => d.clinicId === clinicId),
      scheduleOf: (doctorId: string) => schedules.find((s) => s.doctorId === doctorId),
      schedules,
      appointments,
      bookAppointment,
      cancelAppointment,
      rescheduleAppointment,
      setAppointmentStatus,
      conversations,
      sendMessage,
      markRead,
      ensureConversation,
      toggleSavedDoctor: (id) =>
        setPatient((p) => ({
          ...p,
          savedDoctorIds: p.savedDoctorIds.includes(id)
            ? p.savedDoctorIds.filter((x) => x !== id)
            : [...p.savedDoctorIds, id],
        })),
      toggleSavedClinic: (id) =>
        setPatient((p) => ({
          ...p,
          savedClinicIds: p.savedClinicIds.includes(id)
            ? p.savedClinicIds.filter((x) => x !== id)
            : [...p.savedClinicIds, id],
        })),
    }),
    [
      patient,
      doctors,
      clinics,
      schedules,
      appointments,
      conversations,
      bookAppointment,
      cancelAppointment,
      rescheduleAppointment,
      setAppointmentStatus,
      sendMessage,
      markRead,
      ensureConversation,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** Newly created doctors need a matching schedule id; helper for clinic portal. */
export const newDoctorId = () => nextId("d");
