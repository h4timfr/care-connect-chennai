/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
import { useConversations, useSendMessage, useEnsureConversation } from "@/lib/supabase/messaging";

const NO_DOCTORS: Doctor[] = [];
const NO_CLINICS: Clinic[] = [];
const NO_APPOINTMENTS: Appointment[] = [];
const NO_CONVERSATIONS: Conversation[] = [];
const ACTIVE_CLINIC_KEY = "careconnect.activeClinic";

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
  /** Every clinic the signed-in user is an active member of (from clinic_memberships). */
  memberClinics: Clinic[];
  /** Switches the clinic portal to another of the user's member clinics. */
  setActiveClinicId: (clinicId: string) => void;
  /** True until clinic memberships for the signed-in user are known. */
  isLoadingClinicAccess: boolean;
  /** Set when the membership lookup itself failed (distinct from "no membership"). */
  clinicAccessError: Error | null;
  refetchClinicAccess: () => void;
  doctorById: (id: string) => Doctor | undefined;
  clinicById: (id: string) => Clinic | undefined;
  doctorsOfClinic: (clinicId: string) => Doctor[];

  patientAppointments: Appointment[];
  patientAppointmentsStatus: QueryStatus;
  clinicAppointments: Appointment[];
  clinicAppointmentsStatus: QueryStatus;
  bookAppointment: (input: BookingRequest) => Promise<Appointment>;
  cancelAppointment: (id: string) => Promise<void>;
  /** Resolves once the clinic-side status change is saved; rejects with the backend error. */
  setAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;

  conversations: Conversation[];
  conversationsStatus: QueryStatus;
  sendMessage: (conversationId: string, body: string) => Promise<void>;
  ensureConversation: (args: {
    clinicId: string;
    doctorId?: string;
    appointmentId?: string;
  }) => Promise<string>;

  /** Resolves once the saved state is stored; rejects with the backend error. */
  toggleSavedDoctor: (id: string) => Promise<void>;
  toggleSavedClinic: (id: string) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Sign-in and password-reset screens show no listings.
  const isAuthPage = pathname === "/login" || pathname === "/reset-password";
  const isLoggedIn = !!auth.user && !auth.loading;

  const patientQuery = usePatient(auth.user?.id, auth.user?.email, { enabled: isLoggedIn });
  const patient = patientQuery.data ?? undefined;
  const { refetch: refetchPatientQuery } = patientQuery;
  // Private data is fetched only on the pages that show it.
  const onPatientAppointmentsPage = pathname === "/" || pathname.startsWith("/appointments");
  // Clinic pages that list appointments (doctors, profile and messages don't).
  const onClinicAppointmentsPage = [
    "/clinic",
    "/clinic/appointments",
    "/clinic/calendar",
    "/clinic/patients",
  ].includes(pathname);
  const patientAppointmentsQuery = usePatientAppointments(patient?.id, {
    enabled: isLoggedIn && onPatientAppointmentsPage,
  });

  const clinicsQuery = useClinics({ enabled: !isAuthPage });
  const doctorsQuery = useDoctors({ enabled: !isAuthPage });

  const authorizedClinicsQuery = useAuthorizedClinics(auth.user?.id, { enabled: isLoggedIn });
  const authorizedClinics = authorizedClinicsQuery.data;
  const authorizedClinicIds = useMemo(
    () => (authorizedClinics ?? []).map((c) => c.id),
    [authorizedClinics],
  );
  const clinicAppointmentsQuery = useClinicAppointments(authorizedClinicIds, {
    enabled: isLoggedIn && onClinicAppointmentsPage,
  });

  // Conversations (with every message) are only loaded, and subscribed to, where they're shown.
  // ensureConversation checks the server itself, so other pages don't need them.
  const onMessagesPage = pathname === "/messages" || pathname === "/clinic/messages";
  const conversationsQuery = useConversations(
    patient?.id,
    authorizedClinicIds,
    // Wait for memberships: starting earlier fetches twice, because the query key changes
    // when the clinic ids arrive.
    isLoggedIn && onMessagesPage && !authorizedClinicsQuery.isPending,
  );

  // useMutation returns a new object every render, but its mutate/mutateAsync functions are stable.
  // Depending only on those keeps the callbacks below (and the context value) from rebuilding.
  const { mutateAsync: book } = useBookAppointment();
  const { mutateAsync: cancel } = useCancelAppointment();
  const { mutateAsync: updateStatus } = useUpdateAppointmentStatus();
  const { mutateAsync: send } = useSendMessage();
  const { mutateAsync: createConversation } = useEnsureConversation();
  const { mutateAsync: toggleDoctor } = useToggleSavedDoctor();
  const { mutateAsync: toggleClinic } = useToggleSavedClinic();

  const clinics = clinicsQuery.data ?? NO_CLINICS;
  const doctors = doctorsQuery.data ?? NO_DOCTORS;
  const patientAppointments = patientAppointmentsQuery.data ?? NO_APPOINTMENTS;
  const clinicAppointments = clinicAppointmentsQuery.data ?? NO_APPOINTMENTS;
  const conversations = conversationsQuery.data ?? NO_CONVERSATIONS;

  // The clinic portal supports a single active clinic; RLS guarantees the membership is real.
  // Staff can belong to several clinics. The choice only selects among memberships the server
  // returned (RLS still decides what each query can read); it is remembered for the tab session.
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : sessionStorage.getItem(ACTIVE_CLINIC_KEY);
    } catch {
      return null;
    }
  });
  const memberClinics = authorizedClinics ?? NO_CLINICS;
  const activeClinic = memberClinics.find((c) => c.id === selectedClinicId) ?? memberClinics[0];
  const setActiveClinicId = useCallback((clinicId: string) => {
    setSelectedClinicId(clinicId);
    try {
      sessionStorage.setItem(ACTIVE_CLINIC_KEY, clinicId);
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts until reload.
    }
  }, []);

  const {
    isPending: appointmentsPending,
    isEnabled: appointmentsEnabled,
    error: appointmentsError,
    refetch: refetchAppointments,
  } = patientAppointmentsQuery;
  const {
    isPending: conversationsPending,
    isEnabled: conversationsEnabled,
    error: conversationsError,
    refetch: refetchConversations,
  } = conversationsQuery;

  const {
    isPending: clinicAccessPending,
    error: clinicAccessError,
    refetch: refetchClinicAccessQuery,
  } = authorizedClinicsQuery;
  const {
    isPending: clinicAppointmentsPending,
    isEnabled: clinicAppointmentsEnabled,
    error: clinicAppointmentsError,
    refetch: refetchClinicAppointments,
  } = clinicAppointmentsQuery;

  const { refetch: refetchClinics } = clinicsQuery;
  const { refetch: refetchDoctors } = doctorsQuery;
  const refetchCatalog = useCallback(() => {
    void refetchClinics();
    void refetchDoctors();
  }, [refetchClinics, refetchDoctors]);

  const bookAppointment = useCallback(
    async (input: BookingRequest) => {
      if (!auth.user) throw new Error("Please sign in to book an appointment.");
      return book(input);
    },
    [auth.user, book],
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      await cancel(id);
    },
    [cancel],
  );

  const setAppointmentStatus = useCallback(
    async (id: string, status: AppointmentStatus) => {
      if (!activeClinic) throw new Error("No clinic selected.");
      await updateStatus({ id, status, clinicId: activeClinic.id });
    },
    [activeClinic, updateStatus],
  );

  const sendMessage = useCallback(
    async (conversationId: string, body: string) => {
      if (!auth.user) throw new Error("Please sign in to send messages.");
      await send({ conversationId, senderId: auth.user.id, body });
    },
    [auth.user, send],
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
      return createConversation({
        clinicId,
        patientId: patient.id,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
      });
    },
    [conversations, auth.user, createConversation, patient],
  );

  const toggleSavedDoctor = useCallback(
    async (id: string) => {
      if (!patient) throw new Error("Sign in to save doctors.");
      await toggleDoctor(id);
    },
    [patient, toggleDoctor],
  );

  const toggleSavedClinic = useCallback(
    async (id: string) => {
      if (!patient) throw new Error("Sign in to save clinics.");
      await toggleClinic(id);
    },
    [patient, toggleClinic],
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
      memberClinics,
      setActiveClinicId,
      isLoadingClinicAccess: auth.loading || (isLoggedIn && clinicAccessPending),
      clinicAccessError,
      refetchClinicAccess: () => void refetchClinicAccessQuery(),
      doctorById: (id) => doctors.find((d) => d.id === id),
      clinicById: (id) => clinics.find((c) => c.id === id),
      doctorsOfClinic: (cid) => doctors.filter((d) => d.clinicIds.includes(cid)),

      patientAppointments,
      patientAppointmentsStatus: {
        isLoading: appointmentsEnabled && appointmentsPending,
        error: appointmentsError,
        refetch: () => void refetchAppointments(),
      },
      clinicAppointments,
      clinicAppointmentsStatus: {
        isLoading: clinicAppointmentsEnabled && clinicAppointmentsPending,
        error: clinicAppointmentsError,
        refetch: () => void refetchClinicAppointments(),
      },
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,

      conversations,
      conversationsStatus: {
        isLoading:
          (conversationsEnabled && conversationsPending) ||
          (isLoggedIn && onMessagesPage && clinicAccessPending),
        error: conversationsError,
        refetch: () => void refetchConversations(),
      },
      sendMessage,
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
      memberClinics,
      setActiveClinicId,
      clinicAccessPending,
      clinicAccessError,
      refetchClinicAccessQuery,
      patientAppointments,
      appointmentsPending,
      appointmentsEnabled,
      appointmentsError,
      refetchAppointments,
      clinicAppointments,
      clinicAppointmentsEnabled,
      clinicAppointmentsPending,
      clinicAppointmentsError,
      refetchClinicAppointments,
      bookAppointment,
      cancelAppointment,
      setAppointmentStatus,
      conversations,
      conversationsEnabled,
      conversationsPending,
      onMessagesPage,
      conversationsError,
      refetchConversations,
      sendMessage,
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
