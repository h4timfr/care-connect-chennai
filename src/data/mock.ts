import type {
  Appointment,
  Clinic,
  Conversation,
  Doctor,
  DoctorSchedule,
  Patient,
  Review,
  Slot,
  Specialty,
} from "@/lib/types";
import { addDays, isoDate } from "@/lib/format";

/**
 * DEMO DATA ONLY.
 * Every clinic, doctor, patient, review and message below is fictional and
 * created for prototype purposes. No real provider is represented.
 */

export const SPECIALTIES: Specialty[] = [
  { id: "pediatrics", name: "Pediatrics", icon: "Baby" },
  { id: "orthopedics", name: "Orthopedics", icon: "Bone" },
  { id: "dermatology", name: "Dermatology", icon: "Sparkles" },
  { id: "general", name: "General Medicine", icon: "Stethoscope" },
  { id: "gynecology", name: "Gynecology", icon: "HeartPulse" },
  { id: "ent", name: "ENT", icon: "Ear" },
  { id: "cardiology", name: "Cardiology", icon: "Heart" },
  { id: "dentistry", name: "Dentistry", icon: "Smile" },
  { id: "ophthalmology", name: "Ophthalmology", icon: "Eye" },
  { id: "neurology", name: "Neurology", icon: "Brain" },
];

export const specialtyName = (id: string) =>
  SPECIALTIES.find((s) => s.id === id)?.name ?? "General Medicine";

const HOURS = (weekday: string, hours: string) => ({ day: weekday, hours });

const standardHours = [
  HOURS("Monday", "09:00 – 13:00, 17:00 – 20:30"),
  HOURS("Tuesday", "09:00 – 13:00, 17:00 – 20:30"),
  HOURS("Wednesday", "09:00 – 13:00, 17:00 – 20:30"),
  HOURS("Thursday", "09:00 – 13:00, 17:00 – 20:30"),
  HOURS("Friday", "09:00 – 13:00, 17:00 – 20:30"),
  HOURS("Saturday", "09:00 – 14:00"),
  HOURS("Sunday", "Closed"),
];

export const CLINICS: Clinic[] = [
  {
    id: "c1",
    name: "Little Steps Clinic",
    area: "Adyar",
    address: "12, 3rd Main Road, Gandhi Nagar, Adyar, Chennai 600020",
    phone: "+91 44 4000 1201",
    email: "hello@littlesteps.demo",
    about:
      "A neighbourhood child and family clinic offering paediatric care, vaccinations and routine health checks.",
    specialtyIds: ["pediatrics", "general", "dermatology"],
    services: ["Vaccination", "Child growth monitoring", "Fever clinic", "Nutrition guidance"],
    facilities: ["Wheelchair access", "Pharmacy", "Waiting lounge", "Card payments"],
    languages: ["English", "Tamil", "Hindi"],
    openingHours: standardHours,
    feeRange: [400, 700],
    rating: 4.8,
    reviewCount: 126,

    photoTone: "from-teal-200 to-emerald-100",
  },
  {
    id: "c2",
    name: "Anna Nagar Ortho & Physio Centre",
    area: "Anna Nagar",
    address: "45, 2nd Avenue, Anna Nagar West, Chennai 600040",
    phone: "+91 44 4000 2204",
    email: "care@annanagarortho.demo",
    about: "Orthopaedic consultations, sports injury reviews and physiotherapy under one roof.",
    specialtyIds: ["orthopedics", "general", "neurology"],
    services: ["Fracture care", "Physiotherapy", "Sports injury review", "Digital X-ray"],
    facilities: ["On-site X-ray", "Lift access", "Parking", "Insurance desk"],
    languages: ["English", "Tamil", "Telugu"],
    openingHours: standardHours,
    feeRange: [600, 900],
    rating: 4.6,
    reviewCount: 214,

    photoTone: "from-sky-200 to-cyan-100",
  },
  {
    id: "c3",
    name: "Velachery Family Health Point",
    area: "Velachery",
    address: "8, Vijayanagar Main Road, Velachery, Chennai 600042",
    phone: "+91 44 4000 3310",
    email: "front.desk@vfhp.demo",
    about: "Everyday family medicine, diabetes follow-ups and preventive health check packages.",
    specialtyIds: ["general", "cardiology", "ent"],
    services: ["Health check packages", "Diabetes follow-up", "ECG", "Blood collection"],
    facilities: ["Lab collection", "Parking", "Card payments"],
    languages: ["English", "Tamil"],
    openingHours: standardHours,
    feeRange: [350, 800],
    rating: 4.5,
    reviewCount: 98,

    photoTone: "from-emerald-200 to-lime-100",
  },
  {
    id: "c4",
    name: "T. Nagar Skin & Smile Studio",
    area: "T. Nagar",
    address: "22, Thanikachalam Road, T. Nagar, Chennai 600017",
    phone: "+91 44 4000 4488",
    email: "appointments@skinsmile.demo",
    about: "Dermatology and dental care clinic with evening consultation hours.",
    specialtyIds: ["dermatology", "dentistry"],
    services: ["Acne care", "Dental cleaning", "Root canal", "Skin allergy review"],
    facilities: ["Evening hours", "Card payments", "Air-conditioned waiting"],
    languages: ["English", "Tamil", "Malayalam"],
    openingHours: standardHours,
    feeRange: [500, 1000],
    rating: 4.7,
    reviewCount: 173,

    photoTone: "from-rose-200 to-orange-100",
  },
  {
    id: "c5",
    name: "Nungambakkam Women's Care",
    area: "Nungambakkam",
    address: "5, Sterling Road, Nungambakkam, Chennai 600034",
    phone: "+91 44 4000 5519",
    email: "reception@nwcare.demo",
    about: "Gynaecology, antenatal follow-ups and women's preventive health consultations.",
    specialtyIds: ["gynecology", "general", "ophthalmology"],
    services: ["Antenatal care", "Ultrasound", "PCOS consultation", "Well-woman check"],
    facilities: ["Female staff on duty", "Lift access", "Pharmacy"],
    languages: ["English", "Tamil", "Hindi"],
    openingHours: standardHours,
    feeRange: [600, 1100],
    rating: 4.9,
    reviewCount: 241,

    photoTone: "from-violet-200 to-fuchsia-100",
  },
  {
    id: "c6",
    name: "OMR Neuro & Eye Clinic",
    area: "OMR",
    address: "Unit 3, Thoraipakkam, Old Mahabalipuram Road, Chennai 600097",
    phone: "+91 44 4000 6627",
    email: "desk@omrneuroeye.demo",
    about: "Neurology and ophthalmology consultations for the IT corridor.",
    specialtyIds: ["neurology", "ophthalmology", "ent"],
    services: ["Headache clinic", "Eye check", "Spectacle prescription", "Sleep review"],
    facilities: ["Late evening slots", "Parking", "Wheelchair access"],
    languages: ["English", "Tamil", "Hindi"],
    openingHours: standardHours,
    feeRange: [700, 1200],
    rating: 4.4,
    reviewCount: 87,

    photoTone: "from-indigo-200 to-sky-100",
  },
];

export const clinicById = (id: string) => CLINICS.find((c) => c.id === id);

export const DOCTORS: Doctor[] = [
  {
    id: "d1",
    name: "Dr. Ananya Rao",
    gender: "female",
    specialtyId: "pediatrics",
    clinicIds: ["c1"],
    qualifications: ["MBBS", "MD (Paediatrics)"],
    experienceYears: 12,
    languages: ["English", "Tamil", "Hindi"],
    consultationFee: 500,
    about:
      "Paediatrician with a focus on newborn care, childhood vaccination schedules and growth monitoring.",
    services: ["Newborn care", "Vaccination", "Growth review", "Allergy consultation"],
    rating: 4.8,
    reviewCount: 126,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d2",
    name: "Dr. Karthik Subramanian",
    gender: "male",
    specialtyId: "orthopedics",
    clinicIds: ["c2"],
    qualifications: ["MBBS", "MS (Orthopaedics)"],
    experienceYears: 18,
    languages: ["English", "Tamil", "Telugu"],
    consultationFee: 800,
    about:
      "Orthopaedic consultant seeing joint pain, sports injuries and post-fracture follow-ups.",
    services: ["Joint pain review", "Sports injury", "Fracture follow-up", "Physio referral"],
    rating: 4.6,
    reviewCount: 214,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d3",
    name: "Dr. Meera Krishnan",
    gender: "female",
    specialtyId: "dermatology",
    clinicIds: ["c4"],
    qualifications: ["MBBS", "MD (Dermatology)"],
    experienceYears: 9,
    languages: ["English", "Tamil", "Malayalam"],
    consultationFee: 700,
    about: "Dermatologist consulting on acne, pigmentation, hair fall and skin allergies.",
    services: ["Acne care", "Hair fall review", "Pigmentation", "Patch testing"],
    rating: 4.7,
    reviewCount: 173,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d4",
    name: "Dr. Rajesh Kumar",
    gender: "male",
    specialtyId: "general",
    clinicIds: ["c3"],
    qualifications: ["MBBS", "MD (General Medicine)"],
    experienceYears: 22,
    languages: ["English", "Tamil"],
    consultationFee: 400,
    about: "General physician handling everyday illness, diabetes and blood pressure follow-ups.",
    services: ["Fever & infection", "Diabetes follow-up", "BP review", "Health check"],
    rating: 4.5,
    reviewCount: 98,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d5",
    name: "Dr. Priya Venkatesh",
    gender: "female",
    specialtyId: "gynecology",
    clinicIds: ["c5"],
    qualifications: ["MBBS", "DGO", "DNB (OBG)"],
    experienceYears: 15,
    languages: ["English", "Tamil", "Hindi"],
    consultationFee: 900,
    about: "Gynaecologist consulting on antenatal care, menstrual health and PCOS.",
    services: ["Antenatal visit", "PCOS consultation", "Menstrual health", "Well-woman check"],
    rating: 4.9,
    reviewCount: 241,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d6",
    name: "Dr. Faizal Ahmed",
    gender: "male",
    specialtyId: "ent",
    clinicIds: ["c3"],
    qualifications: ["MBBS", "MS (ENT)"],
    experienceYears: 11,
    languages: ["English", "Tamil", "Urdu"],
    consultationFee: 650,
    about: "ENT specialist seeing sinus concerns, hearing checks and throat complaints.",
    services: ["Sinus review", "Hearing check", "Vertigo consultation", "Tonsil review"],
    rating: 4.4,
    reviewCount: 76,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d7",
    name: "Dr. Lakshmi Narayanan",
    gender: "female",
    specialtyId: "cardiology",
    clinicIds: ["c3"],
    qualifications: ["MBBS", "MD", "DM (Cardiology)"],
    experienceYears: 20,
    languages: ["English", "Tamil", "Telugu"],
    consultationFee: 1100,
    about: "Cardiologist consulting on blood pressure, cholesterol and follow-up cardiac care.",
    services: ["ECG review", "BP management", "Cholesterol review", "Post-procedure follow-up"],
    rating: 4.7,
    reviewCount: 159,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d8",
    name: "Dr. Sanjay Iyer",
    gender: "male",
    specialtyId: "dentistry",
    clinicIds: ["c4"],
    qualifications: ["BDS", "MDS (Conservative Dentistry)"],
    experienceYears: 8,
    languages: ["English", "Tamil"],
    consultationFee: 450,
    about: "Dentist offering cleaning, fillings, root canal treatment and dental reviews.",
    services: ["Dental cleaning", "Filling", "Root canal", "Dental check"],
    rating: 4.6,
    reviewCount: 112,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d9",
    name: "Dr. Divya Shankar",
    gender: "female",
    specialtyId: "ophthalmology",
    clinicIds: ["c6"],
    qualifications: ["MBBS", "MS (Ophthalmology)"],
    experienceYears: 10,
    languages: ["English", "Tamil", "Hindi"],
    consultationFee: 750,
    about: "Eye specialist for vision checks, dry eye concerns and spectacle prescriptions.",
    services: ["Vision check", "Dry eye review", "Spectacle prescription", "Diabetic eye check"],
    rating: 4.5,
    reviewCount: 64,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d10",
    name: "Dr. Arun Prakash",
    gender: "male",
    specialtyId: "neurology",
    clinicIds: ["c6"],
    qualifications: ["MBBS", "MD", "DM (Neurology)"],
    experienceYears: 14,
    languages: ["English", "Tamil", "Hindi"],
    consultationFee: 1200,
    about: "Neurologist consulting on headaches, migraine patterns and sleep concerns.",
    services: ["Headache clinic", "Migraine review", "Sleep consultation", "Follow-up care"],
    rating: 4.6,
    reviewCount: 88,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d11",
    name: "Dr. Nithya Balaji",
    gender: "female",
    specialtyId: "general",
    clinicIds: ["c1"],
    qualifications: ["MBBS", "DNB (Family Medicine)"],
    experienceYears: 7,
    languages: ["English", "Tamil"],
    consultationFee: 400,
    about: "Family physician for everyday illness, travel advice and routine reviews.",
    services: ["Fever & infection", "Travel consultation", "Routine review"],
    rating: 4.3,
    reviewCount: 54,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
  {
    id: "d12",
    name: "Dr. Vignesh Mohan",
    gender: "male",
    specialtyId: "orthopedics",
    clinicIds: ["c2"],
    qualifications: ["MBBS", "DNB (Orthopaedics)"],
    experienceYears: 6,
    languages: ["English", "Tamil", "Hindi"],
    consultationFee: 600,
    about: "Orthopaedic consultant with evening availability for working patients.",
    services: ["Back pain review", "Knee pain", "Post-injury follow-up"],
    rating: 4.2,
    reviewCount: 41,

    registrationNote: "Demo profile — registration details are illustrative.",
  },
];

export const doctorById = (id: string) => DOCTORS.find((d) => d.id === id);
export const doctorsOfClinic = (clinicId: string) =>
  DOCTORS.filter((d) => d.clinicIds.includes(clinicId));

export const SCHEDULES: DoctorSchedule[] = DOCTORS.map((d, i) => ({
  doctorId: d.id,
  slotMinutes: 30,
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", ...(i % 3 === 0 ? ["Sat"] : [])],
  workingHours: { start: i % 2 === 0 ? "09:00" : "10:00", end: i % 2 === 0 ? "20:30" : "19:00" },
  breakPeriod: { start: "13:00", end: "17:00" },
  unavailableDates: [],
}));

export const scheduleOf = (doctorId: string) =>
  SCHEDULES.find((s) => s.doctorId === doctorId) ?? SCHEDULES[0]!;

/* ---------- deterministic slot generation ---------- */

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function slotsForDoctor(doctorId: string, date: string): Slot[] {
  const schedule = scheduleOf(doctorId);
  const weekday = WEEKDAY[new Date(`${date}T00:00:00`).getDay()]!;
  if (!schedule.workingDays.includes(weekday)) return [];
  if (schedule.unavailableDates.includes(date)) return [];

  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  const out: Slot[] = [];
  const start = toMin(schedule.workingHours.start);
  const end = toMin(schedule.workingHours.end);
  const bStart = toMin(schedule.breakPeriod.start);
  const bEnd = toMin(schedule.breakPeriod.end);

  for (let t = start; t < end; t += schedule.slotMinutes) {
    if (t >= bStart && t < bEnd) continue;
    const time = fmt(t);
    const booked = hash(`${doctorId}-${date}-${time}`) % 10 < 4;
    out.push({ date, time, booked });
  }
  return out;
}

export function nextAvailable(doctorId: string): { date: string; times: string[] } | null {
  for (let i = 0; i < 14; i++) {
    const date = isoDate(addDays(new Date(), i));
    const open = slotsForDoctor(doctorId, date).filter((s) => !s.booked);
    if (open.length) return { date, times: open.slice(0, 3).map((s) => s.time) };
  }
  return null;
}

/* ---------- people ---------- */

export const CURRENT_PATIENT: Patient = {
  id: "p1",
  userId: "u1",
  name: "Hatim Maula",
  email: "hatim@demo.careconnect",
  phone: "+91 98400 11223",
  dateOfBirth: "1999-04-18",
  gender: "male",
  preferredLanguage: "English",
  area: "Adyar",
  savedDoctorIds: ["d1", "d5"],
  savedClinicIds: ["c1"],
};

export const CURRENT_CLINIC_ID = "c1";

/* ---------- appointments ---------- */

const today = isoDate(new Date());
const tomorrow = isoDate(addDays(new Date(), 1));
const inThreeDays = isoDate(addDays(new Date(), 3));
const lastWeek = isoDate(addDays(new Date(), -7));
const lastMonth = isoDate(addDays(new Date(), -28));

export const APPOINTMENTS: Appointment[] = [
  {
    id: "a1",
    doctorId: "d1",
    clinicId: "c1",
    patientId: "p1",
    patientName: "Hatim Maula",
    patientPhone: "+91 98400 11223",
    date: tomorrow,
    time: "17:30",
    reason: "Routine consultation",
    status: "confirmed",
    fee: 500,
    createdAt: `${today}T09:12:00`,
  },
  {
    id: "a2",
    doctorId: "d4",
    clinicId: "c3",
    patientId: "p1",
    patientName: "Hatim Maula",
    patientPhone: "+91 98400 11223",
    date: inThreeDays,
    time: "10:30",
    reason: "Diabetes follow-up",
    status: "pending",
    fee: 400,
    createdAt: `${today}T10:02:00`,
  },
  {
    id: "a3",
    doctorId: "d3",
    clinicId: "c4",
    patientId: "p1",
    patientName: "Hatim Maula",
    patientPhone: "+91 98400 11223",
    date: lastWeek,
    time: "18:00",
    reason: "Skin allergy review",
    status: "completed",
    fee: 700,
    createdAt: `${lastWeek}T08:00:00`,
  },
  {
    id: "a4",
    doctorId: "d8",
    clinicId: "c4",
    patientId: "p1",
    patientName: "Hatim Maula",
    patientPhone: "+91 98400 11223",
    date: lastMonth,
    time: "11:00",
    reason: "Dental cleaning",
    status: "completed",
    fee: 450,
    createdAt: `${lastMonth}T08:00:00`,
  },
  {
    id: "a5",
    doctorId: "d2",
    clinicId: "c2",
    patientId: "p1",
    patientName: "Hatim Maula",
    patientPhone: "+91 98400 11223",
    date: lastWeek,
    time: "19:00",
    reason: "Knee pain",
    status: "cancelled",
    fee: 800,
    createdAt: `${lastWeek}T07:10:00`,
  },
  // Clinic-side demo bookings for Little Steps Clinic (c1)
  ...(
    [
      ["a6", "d1", "09:00", "Aarav Menon", "confirmed", "Vaccination"],
      ["a7", "d1", "09:30", "Ishita Raghavan", "arrived", "Fever review"],
      ["a8", "d1", "10:30", "Kabir Sundar", "pending", "Cough & cold"],
      ["a9", "d11", "11:00", "Sneha Varma", "confirmed", "Routine check"],
      ["a10", "d11", "11:30", "Rohan Pillai", "completed", "Travel consultation"],
      ["a11", "d1", "17:30", "Maya Elangovan", "confirmed", "Growth review"],
      ["a12", "d11", "18:00", "Deepak Anand", "cancelled", "Fever review"],
    ] as const
  ).map(([id, doctorId, time, patientName, status, reason]) => ({
    id,
    doctorId,
    clinicId: "c1",
    patientId: `p-${id}`,
    patientName,
    patientPhone: "+91 98400 00000",
    date: today,
    time,
    reason,
    status,
    fee: doctorById(doctorId)?.consultationFee ?? 500,
    createdAt: `${today}T07:00:00`,
  })),
  {
    id: "a13",
    doctorId: "d1",
    clinicId: "c1",
    patientId: "p-a13",
    patientName: "Nisha Gopal",
    patientPhone: "+91 98400 00000",
    date: tomorrow,
    time: "09:30",
    reason: "Vaccination",
    status: "confirmed",
    fee: 500,
    createdAt: `${today}T12:00:00`,
  },
  {
    id: "a14",
    doctorId: "d11",
    clinicId: "c1",
    patientId: "p-a14",
    patientName: "Vikram Selvam",
    patientPhone: "+91 98400 00000",
    date: tomorrow,
    time: "10:00",
    reason: "Routine review",
    status: "pending",
    fee: 400,
    createdAt: `${today}T12:30:00`,
  },
];

/* ---------- conversations ---------- */

const t = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

export const CONVERSATIONS: Conversation[] = [
  {
    id: "cv1",
    clinicId: "c1",
    doctorId: "d1",
    patientId: "p1",
    patientName: "Hatim Maula",
    kind: "appointment",
    appointmentId: "a1",
    unreadForPatient: 1,
    unreadForClinic: 0,
    messages: [
      {
        id: "m1",
        conversationId: "cv1",
        sender: "patient",
        body: "Hi, I'd like to confirm whether my appointment tomorrow is still scheduled.",
        sentAt: t(95),
      },
      {
        id: "m2",
        conversationId: "cv1",
        sender: "clinic",
        body: "Yes, your appointment with Dr. Rao is confirmed for 5:30 PM.",
        sentAt: t(88),
      },
      {
        id: "m3",
        conversationId: "cv1",
        sender: "clinic",
        body: "Please arrive 10 minutes early for registration at the front desk.",
        sentAt: t(87),
      },
    ],
  },
  {
    id: "cv2",
    clinicId: "c3",
    doctorId: "d4",
    patientId: "p1",
    patientName: "Hatim Maula",
    kind: "appointment",
    appointmentId: "a2",
    unreadForPatient: 0,
    unreadForClinic: 1,
    messages: [
      {
        id: "m4",
        conversationId: "cv2",
        sender: "clinic",
        body: "Your request for Friday 10:30 AM with Dr. Rajesh Kumar is received and pending confirmation.",
        sentAt: t(400),
      },
      {
        id: "m5",
        conversationId: "cv2",
        sender: "patient",
        body: "Thank you. Should I come fasting for the blood test?",
        sentAt: t(320),
      },
    ],
  },
  {
    id: "cv3",
    clinicId: "c4",
    patientId: "p1",
    patientName: "Hatim Maula",
    kind: "general",
    unreadForPatient: 0,
    unreadForClinic: 0,
    messages: [
      {
        id: "m6",
        conversationId: "cv3",
        sender: "patient",
        body: "Do you have evening slots on Saturdays for dental cleaning?",
        sentAt: t(2880),
      },
      {
        id: "m7",
        conversationId: "cv3",
        sender: "clinic",
        body: "Saturday hours are 9:00 AM to 2:00 PM. Evening slots are available Monday to Friday.",
        sentAt: t(2820),
      },
    ],
  },
  {
    id: "cv4",
    clinicId: "c1",
    doctorId: "d1",
    patientId: "p-a7",
    patientName: "Ishita Raghavan",
    kind: "appointment",
    appointmentId: "a7",
    unreadForPatient: 0,
    unreadForClinic: 2,
    messages: [
      {
        id: "m8",
        conversationId: "cv4",
        sender: "patient",
        body: "I'm running about 15 minutes late for the 9:30 slot.",
        sentAt: t(45),
      },
      {
        id: "m9",
        conversationId: "cv4",
        sender: "patient",
        body: "Is that alright, or should I rebook?",
        sentAt: t(44),
      },
    ],
  },
  {
    id: "cv5",
    clinicId: "c1",
    patientId: "p-a9",
    patientName: "Sneha Varma",
    kind: "general",
    unreadForPatient: 0,
    unreadForClinic: 1,
    messages: [
      {
        id: "m10",
        conversationId: "cv5",
        sender: "patient",
        body: "Do you accept card payments at the front desk?",
        sentAt: t(180),
      },
    ],
  },
  {
    id: "cv6",
    clinicId: "c1",
    doctorId: "d11",
    patientId: "p-a10",
    patientName: "Rohan Pillai",
    kind: "appointment",
    appointmentId: "a10",
    unreadForPatient: 0,
    unreadForClinic: 0,
    messages: [
      {
        id: "m11",
        conversationId: "cv6",
        sender: "clinic",
        body: "Your consultation summary is ready for collection at the front desk.",
        sentAt: t(600),
      },
      {
        id: "m12",
        conversationId: "cv6",
        sender: "patient",
        body: "Thanks, I'll pick it up tomorrow.",
        sentAt: t(560),
      },
    ],
  },
];

/* ---------- reviews ---------- */

export const REVIEWS: Review[] = [
  {
    id: "r1",
    doctorId: "d1",
    author: "Demo patient · A. Menon",
    rating: 5,
    date: "2026-08-14",
    body: "Explained the vaccination schedule clearly and did not rush the consultation.",
  },
  {
    id: "r2",
    doctorId: "d1",
    author: "Demo patient · S. Varma",
    rating: 4,
    date: "2026-07-30",
    body: "Short waiting time in the evening slot. Front desk was helpful.",
  },
  {
    id: "r3",
    doctorId: "d2",
    author: "Demo patient · R. Pillai",
    rating: 5,
    date: "2026-08-02",
    body: "Reviewed my old X-rays carefully and answered every question.",
  },
  {
    id: "r4",
    doctorId: "d3",
    author: "Demo patient · K. Sundar",
    rating: 4,
    date: "2026-06-21",
    body: "Clear guidance and a simple follow-up plan.",
  },
  {
    id: "r5",
    doctorId: "d5",
    author: "Demo patient · M. Elangovan",
    rating: 5,
    date: "2026-08-25",
    body: "Very patient during the antenatal visit, clinic runs on time.",
  },
];

export const reviewsForDoctor = (doctorId: string) => {
  const found = REVIEWS.filter((r) => r.doctorId === doctorId);
  return found.length ? found : REVIEWS.slice(0, 2).map((r) => ({ ...r, doctorId }));
};

export const CHENNAI_AREAS = [
  "Adyar",
  "Anna Nagar",
  "Velachery",
  "T. Nagar",
  "Nungambakkam",
  "Tambaram",
  "Porur",
  "Mylapore",
  "OMR",
  "Besant Nagar",
];

export const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Malayalam", "Urdu"];
