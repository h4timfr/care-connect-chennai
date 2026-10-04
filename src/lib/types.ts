// Frontend domain model for CareConnect. Rows from Supabase are mapped into these shapes in
// src/lib/supabase/*.ts so components never depend on raw column names.

export type UserRole = "patient" | "doctor" | "clinic";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarInitials: string;
}

export interface Patient {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | null;
  preferredLanguage: string;
  area: string;
  savedDoctorIds: string[];
  savedClinicIds: string[];
}

export interface Specialty {
  id: string;
  name: string;
  icon: string;
}

export interface Clinic {
  id: string;
  name: string;
  area: string;
  address: string;
  phone: string;
  email: string;
  about: string;
  specialtyIds: string[];
  services: string[];
  facilities: string[];
  languages: string[];
  openingHours: { day: string; hours: string }[];
  feeRange: [number, number];
  rating: number;
  reviewCount: number;
  /** Mirrors `clinics.is_demo`: the record is sample content, not a real provider. */
  isSample: boolean;
}

/** A doctor's association with a clinic (`clinic_doctors`). */
export interface ClinicLink {
  clinicId: string;
  active: boolean;
  /** Only active + verified links accept online bookings (enforced by the booking RPC). */
  verified: boolean;
}

export interface Doctor {
  id: string;
  name: string;
  gender: "male" | "female" | "other" | null;
  specialtyId: string;
  clinicIds: string[];
  clinicLinks: ClinicLink[];
  qualifications: string[];
  experienceYears: number;
  languages: string[];
  consultationFee: number;
  about: string;
  services: string[];
  rating: number;
  reviewCount: number;
  registrationNote: string;
  /** Mirrors `doctors.is_demo`: the record is sample content, not a real provider. */
  isSample: boolean;
}

export type DayPart = "morning" | "afternoon" | "evening";

export interface DoctorSchedule {
  doctorId: string;
  slotMinutes: number;
  workingDays: string[];
  workingHours: { start: string; end: string };
}

/** A concrete bookable slot on a given date. */
export interface Slot {
  date: string; // yyyy-mm-dd
  time: string; // "17:30"
  booked: boolean;
}

export type AppointmentStatus = "pending" | "confirmed" | "arrived" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  doctorId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  date: string;
  time: string;
  reason: string;
  status: AppointmentStatus;
  fee: number;
  createdAt: string;
}

export type ConversationKind = "appointment" | "general";

export interface Message {
  id: string;
  conversationId: string;
  sender: "patient" | "clinic";
  body: string;
  sentAt: string;
}

export interface Conversation {
  id: string;
  clinicId: string;
  doctorId?: string | undefined;
  patientId: string;
  patientName: string;
  kind: ConversationKind;
  appointmentId?: string | undefined;
  messages: Message[];
}

export interface Review {
  id: string;
  doctorId: string;
  author: string;
  rating: number;
  date: string;
  body: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
}
