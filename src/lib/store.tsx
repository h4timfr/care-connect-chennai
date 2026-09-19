import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { useAuth } from "@/lib/supabase/auth";
import {
  usePatientAppointments,
  useBookAppointment,
  useCancelAppointment,
  useUpdateAppointmentStatus,
} from "@/lib/supabase/appointments";
import { 
  useClinics, 
  useAuthorizedClinics, 
  useDoctors, 
  useSchedules, 
  usePatient,
  useToggleSavedDoctor,
  useToggleSavedClinic
} from "@/lib/supabase/queries";
import {
  useConversations,
  useSendMessage,
  useMarkRead,
  useEnsureConversation,
} from "@/lib/supabase/messaging";

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
  patient: Patient | undefined;
  isLoadingPatient: boolean;
  

  doctors: Doctor[];
  clinics: Clinic[];
  activeClinic: Clinic | undefined;
  doctorById: (id: string) => Doctor | undefined;
  clinicById: (id: string) => Clinic | undefined;
  doctorsOfClinic: (clinicId: string) => Doctor[];
  scheduleOf: (doctorId: string) => DoctorSchedule | undefined;
  schedules: DoctorSchedule[];

  appointments: Appointment[];
  bookAppointment: (input: BookingInput) => Promise<Appointment>;
  cancelAppointment: (id: string) => void;
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
export const newDoctorId = () => "d" + (++counter);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  const patientQuery = usePatient(auth.user?.id);
  const patientAppointments = usePatientAppointments(patientQuery.data?.id);
  const clinicsQuery = useClinics({ enabled: !isAuthPage });
  const authorizedClinicsQuery = useAuthorizedClinics(auth.user?.id);
  const doctorsQuery = useDoctors({ enabled: !isAuthPage });
  const schedulesQuery = useSchedules({ enabled: !isAuthPage });
  const conversationsQuery = useConversations(auth.user?.id);

  const bookMut = useBookAppointment();
  const cancelMut = useCancelAppointment();
  const updateStatusMut = useUpdateAppointmentStatus();
  const sendMsgMut = useSendMessage();
  const markReadMut = useMarkRead();
  const ensureConvMut = useEnsureConversation();
  const toggleDoctorMut = useToggleSavedDoctor();
  const toggleClinicMut = useToggleSavedClinic();

  const patient = patientQuery.data || undefined;
  const clinics = clinicsQuery.data || [];
  const doctors = doctorsQuery.data || [];
  const schedules = schedulesQuery.data || [];
  const appointments = patientAppointments.data || [];
  const conversations = conversationsQuery.data || [];

  // The UI currently only supports a single active clinic context.
  // We deterministically use the first authorized clinic membership.
  // The RLS guarantees this clinic is authorized for the user.
  const authorizedClinics = authorizedClinicsQuery.data || [];
  const activeClinic = authorizedClinics.length > 0 ? authorizedClinics[0] : undefined;

  const bookAppointment = useCallback(
    async (input: BookingInput) => {
      if (!auth.user) throw new Error("Must be logged in to book");
      const result = await bookMut.mutateAsync({
        doctorId: input.doctorId,
        clinicId: input.clinicId,
        patientId: patient?.id ?? "",
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        date: input.date,
        time: input.time,
        reason: input.reason,
        fee: input.fee,
        status: "pending",
      });
      return result;
    },
    [auth.user, bookMut]
  );

  const cancelAppointment = useCallback(
    (id: string) => { cancelMut.mutate(id); },
    [cancelMut]
  );

  const setAppointmentStatus = useCallback(
    (id: string, status: AppointmentStatus) => {
      if (!activeClinic) return;
      updateStatusMut.mutate({ id, status, clinicId: activeClinic.id });
    },
    [activeClinic, updateStatusMut]
  );

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
    [auth.user, sendMsgMut]
  );

  const markRead = useCallback(
    (conversationId: string, side: "patient" | "clinic") => {
      markReadMut.mutate({ conversationId, side });
    },
    [markReadMut]
  );

  const ensureConversation = useCallback(
    async ({ clinicId, doctorId, appointmentId }: any) => {
      if (!auth.user) throw new Error("Must be logged in");
      if (!patient) throw new Error("Must have a patient profile to chat");
      const patientId = patient.id;
      const existing = conversations.find((c) => c.clinicId === clinicId && c.patientId === patientId);
      if (existing) return existing.id;
      return ensureConvMut.mutateAsync({
        clinicId,
        patientId,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      });
    },
    [conversations, auth.user, ensureConvMut]
  );

  const toggleSavedDoctor = useCallback(
    (id: string) => {
      if (!patient || !auth.user) return;
      const isSaved = patient.savedDoctorIds.includes(id);
      toggleDoctorMut.mutate(id);
    },
    [patient, auth.user, toggleDoctorMut]
  );

  const toggleSavedClinic = useCallback(
    (id: string) => {
      if (!patient || !auth.user) return;
      const isSaved = patient.savedClinicIds.includes(id);
      toggleClinicMut.mutate(id);
    },
    [patient, auth.user, toggleClinicMut]
  );

  

  const value = useMemo<AppState>(
    () => ({
      patient,
      isLoadingPatient: patientQuery.isLoading,
      
      doctors,
      clinics,
      activeClinic,
      doctorById: (id) => doctors.find((d) => d.id === id),
      clinicById: (id) => clinics.find((c) => c.id === id),
      doctorsOfClinic: (cid) => doctors.filter((d) => d.clinicId === cid),
      scheduleOf: (did) => schedules.find((s) => s.doctorId === did),
      schedules,
      appointments,
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,
      conversations,
      sendMessage,
      markRead,
      ensureConversation,
      toggleSavedDoctor,
      toggleSavedClinic,
    }),
    [
      patient,
      patientQuery.isLoading,
      
      doctors,
      clinics,
      activeClinic,
      schedules,
      appointments,
      conversations,
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,
      sendMessage,
      markRead,
      ensureConversation,
      toggleSavedDoctor,
      toggleSavedClinic,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}




