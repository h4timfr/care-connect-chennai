/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Clinic, Doctor, DoctorSchedule } from "@/lib/types";

export function useClinics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["clinics"],
    enabled: options?.enabled ?? true,
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
        openingHours: Array.isArray(c.opening_hours) ? c.opening_hours : [],
        feeRange: c.fee_range || [0, 0],
        rating: Number(c.rating) || 0,
        reviewCount: c.review_count || 0,
        distanceKm: c.distanceKm || 0,
        photoTone: c.photo_tone || "bg-primary-soft",
      })) as Clinic[];
    },
  });
}

export function useDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["doctors"],
    enabled: options?.enabled ?? true,
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

export function useSchedules(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["schedules"],
    enabled: options?.enabled ?? true,
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

export function usePatient(userId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["patient", userId],
    enabled: options?.enabled ?? !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data: pData, error: pError } = await supabase
        .from("patients")
        .select("*, user:users(*)")
        .eq("user_id", userId)
        .maybeSingle();
        
      if (pError) throw pError;
      if (!pData) return null;
      
      const user = Array.isArray(pData.user) ? pData.user[0] : pData.user;
      if (!user) return null;

      return {
        id: pData.id,
        userId: pData.user_id,
        name: pData.full_name,
        email: user.email,
        phone: user.phone ?? "",
        dateOfBirth: pData.date_of_birth ?? "",
        gender: pData.gender ?? "other",
        preferredLanguage: pData.preferred_language ?? "",
        area: pData.area ?? "",
        savedDoctorIds: pData.saved_doctor_ids ?? [],
        savedClinicIds: pData.saved_clinic_ids ?? [],
      } as import("@/lib/types").Patient;
    },
  });
}

export function useAuthorizedClinics(userId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["authorized_clinics", userId],
    enabled: options?.enabled ?? !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("clinic_memberships")
        .select("clinic_id, clinics!inner(*)")
        .eq("user_id", userId)
        .eq("active", true);

      if (error) throw error;
      if (!data) return [];

      return data.map((row: any) => {
        const c = Array.isArray(row.clinics) ? row.clinics[0] : row.clinics;
        return {
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
          openingHours: Array.isArray(c.opening_hours) ? c.opening_hours : [],
          feeRange: c.fee_range || [0, 0],
          rating: Number(c.rating) || 0,
          reviewCount: c.review_count || 0,
          distanceKm: c.distanceKm || 0,
          photoTone: c.photo_tone || "bg-primary-soft",
        } as Clinic;
      });
    },
  });
}

export function useToggleSavedDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doctorId: string) => {
      const { data, error } = await supabase.rpc("toggle_saved_doctor", { p_doctor_id: doctorId });
      if (error) throw error;
      return data;
    },
    onSuccess: (newArray, doctorId, context: any) => {
      // Invalidate the patient query to ensure cache is correct
      queryClient.invalidateQueries({ queryKey: ["patient"] });
    },
  });
}

export function useToggleSavedClinic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clinicId: string) => {
      const { data, error } = await supabase.rpc("toggle_saved_clinic", { p_clinic_id: clinicId });
      if (error) throw error;
      return data;
    },
    onSuccess: (newArray, clinicId, context: any) => {
      queryClient.invalidateQueries({ queryKey: ["patient"] });
    },
  });
}


