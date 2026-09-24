// Conceptual data model for CareConnect.
// Shapes mirror a future PostgreSQL schema so a real backend can be swapped in
// without changing the UI layer.

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
  gender: "male" | "female" | "other";
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
  photoTone: string;
}

export interface Doctor {
  id: string;
  name: string;
  gender: "male" | "female";
  specialtyId: string;
  clinicIds: string[];
  qualifications: string[];
  experienceYears: number;
  languages: string[];
  consultationFee: number;
  about: string;
  services: string[];
  rating: number;
  reviewCount: number;
  registrationNote: string;
}

export type DayPart = "morning" | "afternoon" | "evening";

export interface DoctorSchedule {
  doctorId: string;
  slotMinutes: number;
  workingDays: string[];
  workingHours: { start: string; end: string };
  breakPeriod: { start: string; end: string };
  unavailableDates: string[];
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
  unreadForPatient: number;
  unreadForClinic: number;
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
