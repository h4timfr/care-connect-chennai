/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Clinic, Doctor, DoctorSchedule } from "@/lib/types";

export function useClinics() {
  return useQuery({
    queryKey: ["clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("*");
      if (error) throw error;

      return data.map((c: any) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        area: c.area,
        phone: c.phone,
        email: c.email,
        about: c.about,
        specialtyIds: c.specialty_ids || [],
        services: c.services || [],
        facilities: c.facilities || [],
        languages: c.languages || [],
        feeRange: c.fee_range || [0, 0],
        rating: Number(c.rating) || 0,
        reviewCount: c.review_count || 0,
        distanceKm: c.distanceKm || 0,
        photoTone: c.photo_tone || "bg-primary-soft",
      })) as Clinic[];
    },
  });
}

export function useDoctors() {
  return useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select(`
          *,
          clinic_doctors(clinic_id)
        `);
      if (error) throw error;

      return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        gender: d.gender,
        experienceYears: d.experience_years,
        consultationFee: Number(d.consultation_fee),
        about: d.about,
        specialtyId: d.specialty_id || "general",
        qualifications: d.qualifications || [],
        languages: d.languages || [],
        services: d.services || [],
        rating: Number(d.rating) || 0,
        reviewCount: d.review_count || 0,
        distanceKm: d.distanceKm || 0,
        registrationNote: d.registration_note,
        clinicId: d.clinic_doctors?.[0]?.clinic_id,
      })) as Doctor[];
    },
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctor_schedules").select("*");
      if (error) throw error;

      const dayMapReverse: Record<number, string> = {
        0: "Sun",
        1: "Mon",
        2: "Tue",
        3: "Wed",
        4: "Thu",
        5: "Fri",
        6: "Sat",
      };
      const scheduleMap = new Map<string, DoctorSchedule>();

      for (const s of data) {
        const key = `${s.doctor_id}-${s.clinic_id}`;
        if (!scheduleMap.has(key)) {
          scheduleMap.set(key, {
            doctorId: s.doctor_id,
            slotMinutes: s.slot_minutes,
            workingDays: [],
            workingHours: { start: s.start_time.substring(0, 5), end: s.end_time.substring(0, 5) },
            breakPeriod: { start: "13:00", end: "14:00" },
            unavailableDates: [],
          });
        }
        const schedule = scheduleMap.get(key)!;
        const dayStr = dayMapReverse[s.day_of_week] as string;
        if (dayStr && !schedule.workingDays.includes(dayStr)) {
          schedule.workingDays.push(dayStr);
        }
      }
      return Array.from(scheduleMap.values());
    },
  });
}
