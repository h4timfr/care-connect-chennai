import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./client";
import type { Database } from "@/lib/database.types";

/*
 * Private provider-candidate review (migration 00056). Research candidates are NOT CareConnect
 * providers: separate tables, platform admins only (RLS), never bookable, never listed. The review
 * UI can change only review state and notes, and append evidence and contact records; the database
 * refuses "verified" or "permission granted" until the required evidence exists.
 */

type Tables = Database["public"]["Tables"];
export type FacilityCandidate = Tables["candidate_facilities"]["Row"];
export type DoctorCandidate = Tables["candidate_doctors"]["Row"];
export type CandidateRelationship = Tables["candidate_relationships"]["Row"];
export type CandidateSource = Tables["candidate_sources"]["Row"];
export type CandidateEvidence = Tables["candidate_evidence"]["Row"];
export type CandidateContact = Tables["candidate_contacts"]["Row"];
export type ReviewStatus = FacilityCandidate["review_status"];
export type PermissionStatus = FacilityCandidate["permission_status"];
export type EvidenceType = CandidateEvidence["evidence_type"];
export type ContactMethod = CandidateContact["method"];
export type ContactOutcome = CandidateContact["outcome"];
export type Confidence = FacilityCandidate["source_confidence"];
export type CandidateKind = "facility" | "doctor";

export const REVIEW_STATUSES: ReviewStatus[] = [
  "candidate",
  "under_review",
  "contact_pending",
  "contacted",
  "verification_pending",
  "verified",
  "rejected",
];
export const PERMISSION_STATUSES: PermissionStatus[] = [
  "unknown",
  "requested",
  "granted",
  "denied",
];
export const EVIDENCE_TYPES: EvidenceType[] = [
  "provider_identity",
  "clinic_identity",
  "doctor_registration",
  "doctor_clinic_relationship",
  "address",
  "contact_details",
  "listing_permission",
  "appointment_arrangement",
];
export const CONTACT_METHODS: ContactMethod[] = [
  "phone",
  "email",
  "in_person",
  "website_form",
  "other",
];
export const CONTACT_OUTCOMES: ContactOutcome[] = [
  "no_response",
  "reached",
  "interested",
  "declined",
  "follow_up",
  "wrong_contact",
];

/** Evidence the database requires before a candidate can be marked verified (00056 trigger). */
export const REQUIRED_EVIDENCE: Record<CandidateKind, EvidenceType[]> = {
  facility: ["clinic_identity", "address", "contact_details"],
  doctor: ["provider_identity", "doctor_registration"],
};

export interface CandidateCatalogue {
  facilities: FacilityCandidate[];
  doctors: DoctorCandidate[];
  relationships: CandidateRelationship[];
}

/** The whole candidate catalogue (tens of rows), filtered in the browser. */
export function useCandidateCatalogue(enabled: boolean) {
  return useQuery({
    queryKey: ["candidates"],
    enabled,
    retry: false,
    queryFn: async (): Promise<CandidateCatalogue> => {
      const [facilities, doctors, relationships] = await Promise.all([
        supabase.from("candidate_facilities").select("*").order("research_id").limit(1000),
        supabase.from("candidate_doctors").select("*").order("research_id").limit(1000),
        supabase.from("candidate_relationships").select("*").limit(5000),
      ]);
      if (facilities.error) throw facilities.error;
      if (doctors.error) throw doctors.error;
      if (relationships.error) throw relationships.error;
      return {
        facilities: facilities.data,
        doctors: doctors.data,
        relationships: relationships.data,
      };
    },
  });
}

const subjectColumn = (kind: CandidateKind) =>
  kind === "facility" ? "facility_candidate_id" : "doctor_candidate_id";

export interface CandidateDetail {
  sources: CandidateSource[];
  evidence: CandidateEvidence[];
  contacts: CandidateContact[];
  /** Sources and evidence of this candidate's researched relationships, by relationship id. */
  relationshipSources: CandidateSource[];
  relationshipEvidence: CandidateEvidence[];
}

/** Provenance, evidence and contact log for one candidate. */
export function useCandidateDetail(
  kind: CandidateKind,
  id: string | undefined,
  relationshipIds: string[],
) {
  return useQuery({
    queryKey: ["candidates", kind, id, relationshipIds.join(",")],
    enabled: !!id,
    retry: false,
    queryFn: async (): Promise<CandidateDetail> => {
      if (!id) throw new Error("No candidate selected.");
      const col = subjectColumn(kind);
      const rel = relationshipIds.length
        ? relationshipIds
        : ["00000000-0000-0000-0000-000000000000"];
      const [sources, evidence, contacts, relSources, relEvidence] = await Promise.all([
        supabase.from("candidate_sources").select("*").eq(col, id).order("researched_on"),
        supabase.from("candidate_evidence").select("*").eq(col, id).order("recorded_at"),
        supabase.from("candidate_contacts").select("*").eq(col, id).order("contacted_on"),
        supabase.from("candidate_sources").select("*").in("relationship_id", rel),
        supabase.from("candidate_evidence").select("*").in("relationship_id", rel),
      ]);
      for (const r of [sources, evidence, contacts, relSources, relEvidence])
        if (r.error) throw r.error;
      return {
        sources: sources.data ?? [],
        evidence: evidence.data ?? [],
        contacts: contacts.data ?? [],
        relationshipSources: relSources.data ?? [],
        relationshipEvidence: relEvidence.data ?? [],
      };
    },
  });
}

export function useUpdateCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: CandidateKind;
      id: string;
      update: {
        review_status?: ReviewStatus;
        permission_status?: PermissionStatus;
        notes?: string | null;
      };
    }) => {
      const table = args.kind === "facility" ? "candidate_facilities" : "candidate_doctors";
      // .single() turns "nothing updated" (RLS) into an error, never a silent success.
      const { error } = await supabase
        .from(table)
        .update(args.update)
        .eq("id", args.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useUpdateRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      careconnectStatus: CandidateRelationship["careconnect_status"];
    }) => {
      const { error } = await supabase
        .from("candidate_relationships")
        .update({ careconnect_status: args.careconnectStatus })
        .eq("id", args.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useRecordEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      subject: { kind: CandidateKind | "relationship"; id: string };
      evidenceType: EvidenceType;
      value: string;
      source: string;
    }) => {
      const { kind, id } = args.subject;
      const { error } = await supabase
        .from("candidate_evidence")
        .insert({
          // Exactly one subject (a CHECK in 00056).
          facility_candidate_id: kind === "facility" ? id : null,
          doctor_candidate_id: kind === "doctor" ? id : null,
          relationship_id: kind === "relationship" ? id : null,
          evidence_type: args.evidenceType,
          value: args.value.trim(),
          source: args.source.trim(),
        })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useLogContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: CandidateKind;
      id: string;
      contactedOn: string;
      method: ContactMethod;
      outcome: ContactOutcome;
      permissionStatus: PermissionStatus;
      notes: string;
    }) => {
      const { error } = await supabase
        .from("candidate_contacts")
        .insert({
          facility_candidate_id: args.kind === "facility" ? args.id : null,
          doctor_candidate_id: args.kind === "doctor" ? args.id : null,
          contacted_on: args.contactedOn,
          method: args.method,
          outcome: args.outcome,
          permission_status: args.permissionStatus,
          notes: args.notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

/** Only http(s) links are rendered; anything else is shown as plain text. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
