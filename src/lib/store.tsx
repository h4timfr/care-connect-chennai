/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import type {
  Appointment,
  AppointmentStatus,
  Clinic,
  Conversation,
  Doctor,
  Patient,
} from "@/lib/types";
import { useAuth } from "@/lib/supabase/auth";
import {
  usePatientAppointments,
  useClinicAppointments,
  useBookAppointment,
  useCancelAppointment,
  useUpdateAppointmentStatus,
  type BookingRequest,
} from "@/lib/supabase/appointments";
import {
  useClinics,
  useAuthorizedClinics,
  useDoctors,
  usePatient,
  useToggleSavedDoctor,
  useToggleSavedClinic,
} from "@/lib/supabase/queries";
import {
  useConversations,
  useSendMessage,
  useMarkRead,
  useEnsureConversation,
} from "@/lib/supabase/messaging";

const NO_DOCTORS: Doctor[] = [];
const NO_CLINICS: Clinic[] = [];
const NO_APPOINTMENTS: Appointment[] = [];
const NO_CONVERSATIONS: Conversation[] = [];

interface QueryStatus {
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface AppState {
  patient: Patient | undefined;
  /** True until we know whether the signed-in user has a patient profile. */
  isLoadingPatient: boolean;
  patientError: Error | null;
  refetchPatient: () => void;

  doctors: Doctor[];
  clinics: Clinic[];
  /** Status of the doctor + clinic listings shared across the app. */
  catalog: QueryStatus;
  activeClinic: Clinic | undefined;
  /** True until clinic memberships for the signed-in user are known. */
  isLoadingClinicAccess: boolean;
  doctorById: (id: string) => Doctor | undefined;
  clinicById: (id: string) => Clinic | undefined;
  doctorsOfClinic: (clinicId: string) => Doctor[];

  patientAppointments: Appointment[];
  patientAppointmentsStatus: QueryStatus;
  clinicAppointments: Appointment[];
  bookAppointment: (input: BookingRequest) => Promise<Appointment>;
  cancelAppointment: (id: string) => Promise<void>;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => void;

  conversations: Conversation[];
  conversationsStatus: QueryStatus;
  sendMessage: (conversationId: string, body: string) => Promise<void>;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/login";
  const isLoggedIn = !!auth.user && !auth.loading;

  const patientQuery = usePatient(auth.user?.id, auth.user?.email, { enabled: isLoggedIn });
  const patient = patientQuery.data ?? undefined;
  const { refetch: refetchPatientQuery } = patientQuery;
  const patientAppointmentsQuery = usePatientAppointments(patient?.id, { enabled: isLoggedIn });

  const clinicsQuery = useClinics({ enabled: !isAuthPage });
  const doctorsQuery = useDoctors({ enabled: !isAuthPage });

  const authorizedClinicsQuery = useAuthorizedClinics(auth.user?.id, { enabled: isLoggedIn });
  const authorizedClinics = authorizedClinicsQuery.data;
  const authorizedClinicIds = useMemo(
    () => (authorizedClinics ?? []).map((c) => c.id),
    [authorizedClinics],
  );
  const clinicAppointmentsQuery = useClinicAppointments(authorizedClinicIds, {
    enabled: isLoggedIn,
  });

  const conversationsQuery = useConversations(patient?.id, authorizedClinicIds, isLoggedIn);

  const bookMut = useBookAppointment();
  const cancelMut = useCancelAppointment();
  const updateStatusMut = useUpdateAppointmentStatus();
  const sendMsgMut = useSendMessage();
  const markReadMut = useMarkRead();
  const ensureConvMut = useEnsureConversation();
  const toggleDoctorMut = useToggleSavedDoctor();
  const toggleClinicMut = useToggleSavedClinic();

  const clinics = clinicsQuery.data ?? NO_CLINICS;
  const doctors = doctorsQuery.data ?? NO_DOCTORS;
  const patientAppointments = patientAppointmentsQuery.data ?? NO_APPOINTMENTS;
  const clinicAppointments = clinicAppointmentsQuery.data ?? NO_APPOINTMENTS;
  const conversations = conversationsQuery.data ?? NO_CONVERSATIONS;

  // The clinic portal supports a single active clinic; RLS guarantees the membership is real.
  const activeClinic = authorizedClinics?.[0];

  const {
    isPending: appointmentsPending,
    error: appointmentsError,
    refetch: refetchAppointments,
  } = patientAppointmentsQuery;
  const {
    isPending: conversationsPending,
    isEnabled: conversationsEnabled,
    error: conversationsError,
    refetch: refetchConversations,
  } = conversationsQuery;

  const { refetch: refetchClinics } = clinicsQuery;
  const { refetch: refetchDoctors } = doctorsQuery;
  const refetchCatalog = useCallback(() => {
    void refetchClinics();
    void refetchDoctors();
  }, [refetchClinics, refetchDoctors]);

  const bookAppointment = useCallback(
    async (input: BookingRequest) => {
      if (!auth.user) throw new Error("Please sign in to book an appointment.");
      return bookMut.mutateAsync(input);
    },
    [auth.user, bookMut],
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      await cancelMut.mutateAsync(id);
    },
    [cancelMut],
  );

  const setAppointmentStatus = useCallback(
    (id: string, status: AppointmentStatus) => {
      if (!activeClinic) return;
      updateStatusMut.mutate({ id, status, clinicId: activeClinic.id });
    },
    [activeClinic, updateStatusMut],
  );

  const sendMessage = useCallback(
    async (conversationId: string, body: string) => {
      if (!auth.user) throw new Error("Please sign in to send messages.");
      await sendMsgMut.mutateAsync({ conversationId, senderId: auth.user.id, body });
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
      if (!auth.user) throw new Error("Please sign in to message a clinic.");
      if (!patient)
        throw new Error("Your account has no patient profile, so it can't message clinics.");
      const existing = conversations.find(
        (c) => c.clinicId === clinicId && c.patientId === patient.id,
      );
      if (existing) return existing.id;
      return ensureConvMut.mutateAsync({
        clinicId,
        patientId: patient.id,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      });
    },
    [conversations, auth.user, ensureConvMut, patient],
  );

  const toggleSavedDoctor = useCallback(
    (id: string) => {
      if (patient) toggleDoctorMut.mutate(id);
    },
    [patient, toggleDoctorMut],
  );

  const toggleSavedClinic = useCallback(
    (id: string) => {
      if (patient) toggleClinicMut.mutate(id);
    },
    [patient, toggleClinicMut],
  );

  const value = useMemo<AppState>(
    () => ({
      patient,
      isLoadingPatient: auth.loading || (isLoggedIn && patientQuery.isPending),
      patientError: patientQuery.error,
      refetchPatient: () => void refetchPatientQuery(),

      doctors,
      clinics,
      catalog: {
        isLoading: clinicsQuery.isPending || doctorsQuery.isPending,
        error: clinicsQuery.error ?? doctorsQuery.error,
        refetch: refetchCatalog,
      },
      activeClinic,
      isLoadingClinicAccess: auth.loading || (isLoggedIn && authorizedClinicsQuery.isPending),
      doctorById: (id) => doctors.find((d) => d.id === id),
      clinicById: (id) => clinics.find((c) => c.id === id),
      doctorsOfClinic: (cid) => doctors.filter((d) => d.clinicIds.includes(cid)),

      patientAppointments,
      patientAppointmentsStatus: {
        isLoading: !!patient && appointmentsPending,
        error: appointmentsError,
        refetch: () => void refetchAppointments(),
      },
      clinicAppointments,
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,

      conversations,
      conversationsStatus: {
        isLoading: conversationsEnabled && conversationsPending,
        error: conversationsError,
        refetch: () => void refetchConversations(),
      },
      sendMessage,
      markRead,
      ensureConversation,
      toggleSavedDoctor,
      toggleSavedClinic,
    }),
    [
      patient,
      auth.loading,
      isLoggedIn,
      patientQuery.isPending,
      patientQuery.error,
      refetchPatientQuery,
      doctors,
      clinics,
      clinicsQuery.isPending,
      clinicsQuery.error,
      doctorsQuery.isPending,
      doctorsQuery.error,
      refetchCatalog,
      activeClinic,
      authorizedClinicsQuery.isPending,
      patientAppointments,
      appointmentsPending,
      appointmentsError,
      refetchAppointments,
      clinicAppointments,
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,
      conversations,
      conversationsEnabled,
      conversationsPending,
      conversationsError,
      refetchConversations,
      sendMessage,
      markRead,
      ensureConversation,
      toggleSavedDoctor,
      toggleSavedClinic,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
