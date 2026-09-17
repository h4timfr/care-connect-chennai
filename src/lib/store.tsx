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
  role: UserRole;
  setRole: (role: UserRole) => void;
  signedIn: boolean;
  signIn: (role: UserRole) => void;
  signOut: () => void;

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
  bookAppointment: (input: BookingInput) => Appointment;
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
  }) => string;

  toggleSavedDoctor: (id: string) => void;
  toggleSavedClinic: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

let counter = 100;
const nextId = (prefix: string) => `${prefix}${++counter}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("patient");
  const [signedIn, setSignedIn] = useState(true);
  const [patient, setPatient] = useState<Patient>(CURRENT_PATIENT);
  const [doctors, setDoctors] = useState<Doctor[]>(DOCTORS);
  const [clinics, setClinics] = useState<Clinic[]>(CLINICS);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>(SCHEDULES);
  const [appointments, setAppointments] = useState<Appointment[]>(APPOINTMENTS);
  const [conversations, setConversations] = useState<Conversation[]>(CONVERSATIONS);

  const activeClinic = clinics.find((c) => c.id === CURRENT_CLINIC_ID) ?? clinics[0]!;

  const bookAppointment = useCallback((input: BookingInput) => {
    const appointment: Appointment = {
      id: nextId("a"),
      patientId: CURRENT_PATIENT.id,
      status: "confirmed",
      createdAt: new Date().toISOString(),
      ...input,
    };
    setAppointments((prev) => [appointment, ...prev]);
    return appointment;
  }, []);

  const cancelAppointment = useCallback((id: string) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "cancelled" as const } : a)),
    );
  }, []);

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
    [],
  );

  const markRead = useCallback((conversationId: string, side: "patient" | "clinic") => {
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
  }, []);

  const ensureConversation = useCallback(
    ({
      clinicId,
      doctorId,
      appointmentId,
    }: {
      clinicId: string;
      doctorId?: string;
      appointmentId?: string;
    }) => {
      const existing = conversations.find(
        (c) => c.clinicId === clinicId && c.patientId === CURRENT_PATIENT.id,
      );
      if (existing) return existing.id;
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
          unreadForClinic: 0,
          unreadForPatient: 0,
          messages: [],
        },
        ...prev,
      ]);
      return id;
    },
    [conversations],
  );

  const value = useMemo<AppState>(
    () => ({
      role,
      setRole,
      signedIn,
      signIn: (r: UserRole) => {
        setRole(r);
        setSignedIn(true);
      },
      signOut: () => setSignedIn(false),
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
      role,
      signedIn,
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
