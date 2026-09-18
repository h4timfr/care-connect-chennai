import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  APPOINTMENTS,
  CLINICS,
  CONVERSATIONS,
  CURRENT_CLINIC_ID,
  CURRENT_PATIENT,
  DOCTORS,
  SCHEDULES,
} from "@/data/mock";
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
  updateClinic: (patch: Partial<Clinic>) => void;
  upsertDoctor: (doctor: Doctor) => void;
  removeDoctor: (id: string) => void;

  schedules: DoctorSchedule[];
  updateSchedule: (doctorId: string, patch: Partial<DoctorSchedule>) => void;

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

import { useConversations, useSendMessage, useMarkRead, useEnsureConversation } from "@/lib/supabase/messaging";

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

  // Global Mock Fallbacks (for non-migrated domains only)
  const [patient, setPatient] = useState<Patient>(CURRENT_PATIENT);
  const [mockClinics, setClinics] = useState<Clinic[]>(CLINICS);
  const [mockDoctors, setDoctors] = useState<Doctor[]>(DOCTORS);
  const [mockSchedules, setSchedules] = useState<DoctorSchedule[]>(SCHEDULES);
  const [mockAppointments, setAppointments] = useState<Appointment[]>(APPOINTMENTS);
  const [mockConversations, setConversations] = useState<Conversation[]>(CONVERSATIONS);

  const appointments =
    hasSupabase && patientAppointments.data ? patientAppointments.data : mockAppointments;
  const clinics = hasSupabase && clinicsQuery.data ? clinicsQuery.data : mockClinics;
  const doctors = hasSupabase && doctorsQuery.data ? doctorsQuery.data : mockDoctors;
  const schedules = hasSupabase && schedulesQuery.data ? schedulesQuery.data : mockSchedules;
  const conversations = hasSupabase && conversationsQuery.data ? conversationsQuery.data : mockConversations;

  const activeClinic = clinics.find((c) => c.id === CURRENT_CLINIC_ID) ?? clinics[0]!;

  const bookAppointment = useCallback(
    async (input: BookingInput) => {
      if (hasSupabase && auth.user) {
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
        });

        return {
          id: "temp",
          patientId: auth.user.id,
          status: "pending",
          createdAt: new Date().toISOString(),
          ...input,
        } as Appointment;
      }

      const appointment: Appointment = {
        id: nextId("a"),
        patientId: CURRENT_PATIENT.id,
        status: "confirmed",
        createdAt: new Date().toISOString(),
        ...input,
      };
      setAppointments((prev) => [appointment, ...prev]);
      return appointment;
    },
    [hasSupabase, auth.user, bookMut],
  );

  const cancelAppointment = useCallback(
    (id: string) => {
      if (hasSupabase && auth.user) {
        cancelMut.mutate(id);
        return;
      }
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "cancelled" as const } : a)),
      );
    },
    [hasSupabase, auth.user, cancelMut],
  );

  const rescheduleAppointment = useCallback((id: string, date: string, time: string) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, date, time, status: "confirmed" as const } : a)),
    );
  }, []);

  const setAppointmentStatus = useCallback((id: string, status: AppointmentStatus) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const sendMessage = useCallback(
    (conversationId: string, sender: "patient" | "clinic", body: string) => {
      if (hasSupabase && auth.user) {
        sendMsgMut.mutate({ conversationId, senderId: auth.user.id, body, isPatient: sender === "patient" });
        return;
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unreadForClinic: sender === "patient" ? c.unreadForClinic + 1 : c.unreadForClinic,
                unreadForPatient: sender === "clinic" ? c.unreadForPatient + 1 : c.unreadForPatient,
                messages: [
                  ...c.messages,
                  {
                    id: nextId("m"),
                    conversationId,
                    sender,
                    body,
                    sentAt: new Date().toISOString(),
                  },
                ],
              }
            : c,
        ),
      );
    },
    [hasSupabase, auth.user, sendMsgMut],
  );

  const markRead = useCallback(
    (conversationId: string, side: "patient" | "clinic") => {
      if (hasSupabase) {
        markReadMut.mutate({ conversationId, side });
        return;
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unreadForPatient: side === "patient" ? 0 : c.unreadForPatient,
                unreadForClinic: side === "clinic" ? 0 : c.unreadForClinic,
              }
            : c,
        ),
      );
    },
    [hasSupabase, markReadMut],
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
      const patientId = hasSupabase && auth.user ? auth.user.id : CURRENT_PATIENT.id;
      const existing = conversations.find(
        (c) => c.clinicId === clinicId && c.patientId === patientId,
      );
      if (existing) return existing.id;
      
      if (hasSupabase) {
        return ensureConvMut.mutateAsync({ clinicId, doctorId, appointmentId, patientId });
      }

      const id = nextId("cv");
      setConversations((prev) => [
        {
          id,
          clinicId,
          doctorId,
          appointmentId,
          patientId: CURRENT_PATIENT.id,
          patientName: CURRENT_PATIENT.name,
          kind: appointmentId ? "appointment" : "general",
          unreadForPatient: 0,
          unreadForClinic: 0,
          messages: [],
        },
        ...prev,
      ]);
      return id;
    },
    [conversations, hasSupabase, auth.user, ensureConvMut],
  );

  const value = useMemo<AppState>(
    () => ({
      patient,
      updatePatient: (patch) => setPatient((p) => ({ ...p, ...patch })),
      doctors,
      clinics,
      activeClinic,
      updateClinic: (patch) =>
        setClinics((prev) => prev.map((c) => (c.id === activeClinic.id ? { ...c, ...patch } : c))),
      upsertDoctor: (doctor) =>
        setDoctors((prev) =>
          prev.some((d) => d.id === doctor.id)
            ? prev.map((d) => (d.id === doctor.id ? doctor : d))
            : [...prev, doctor],
        ),
      removeDoctor: (id) => setDoctors((prev) => prev.filter((d) => d.id !== id)),
      schedules,
      updateSchedule: (doctorId, patch) =>
        setSchedules((prev) => prev.map((s) => (s.doctorId === doctorId ? { ...s, ...patch } : s))),
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
      activeClinic,
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
