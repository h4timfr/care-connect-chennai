import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { supabase } from "./client";
import type { Database } from "@/lib/database.types";

type ResponseArgs = Database["public"]["Functions"]["respond_doctor_clinic_link"]["Args"];

export function useDoctorClinicLinkRequests(clinicId?: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["doctor_clinic_link_requests", user?.id, clinicId],
    enabled: enabled && !!user,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("list_doctor_clinic_link_requests", clinicId ? { p_clinic_id: clinicId } : {})
        .abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
}

export function useRequestDoctorClinicLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clinicId, doctorId }: { clinicId: string; doctorId: string }) => {
      const { error } = await supabase.rpc("request_doctor_clinic_link", {
        p_clinic_id: clinicId,
        p_doctor_id: doctorId,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["doctor_clinic_link_requests"] }),
  });
}

export function useRespondDoctorClinicLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ResponseArgs) => {
      const { error } = await supabase.rpc("respond_doctor_clinic_link", args);
      if (error) throw error;
    },
    onSettled: (_data, error, args) => {
      const requests = queryClient.invalidateQueries({ queryKey: ["doctor_clinic_link_requests"] });
      if (error || args.p_action !== "accept") return requests;
      return Promise.all([
        requests,
        queryClient.invalidateQueries({ queryKey: ["clinic_doctors"] }),
        queryClient.invalidateQueries({ queryKey: ["my_doctor"] }),
      ]);
    },
  });
}
