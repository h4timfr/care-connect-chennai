export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          clinic_id: string;
          created_at: string;
          date: string;
          doctor_id: string;
          fee: number;
          id: string;
          patient_id: string;
          reason: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          time: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          date: string;
          doctor_id: string;
          fee?: number;
          id?: string;
          patient_id: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          time: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          date?: string;
          doctor_id?: string;
          fee?: number;
          id?: string;
          patient_id?: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action_type: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          ip_address: string | null;
          metadata: Json | null;
          target_id: string | null;
        };
        Insert: {
          action_type: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          target_id?: string | null;
        };
        Update: {
          action_type?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          target_id?: string | null;
        };
        Relationships: [];
      };
      clinic_doctors: {
        Row: {
          active: boolean;
          clinic_id: string;
          doctor_id: string;
          ended_at: string | null;
          started_at: string;
          verification_state: string;
        };
        Insert: {
          active?: boolean;
          clinic_id: string;
          doctor_id: string;
          ended_at?: string | null;
          started_at?: string;
          verification_state?: string;
        };
        Update: {
          active?: boolean;
          clinic_id?: string;
          doctor_id?: string;
          ended_at?: string | null;
          started_at?: string;
          verification_state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_doctors_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_doctors_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_memberships: {
        Row: {
          active: boolean;
          clinic_id: string;
          created_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          clinic_id: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_memberships_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          about: string | null;
          address: string;
          area: string | null;
          created_at: string;
          email: string;
          facilities: string[] | null;
          fee_range: number[] | null;
          id: string;
          is_demo: boolean;
          languages: string[] | null;
          lat: number | null;
          lng: number | null;
          name: string;
          opening_hours: Json | null;
          phone: string;
          photo_tone: string | null;
          rating: number | null;
          review_count: number | null;
          services: string[] | null;
          specialty_ids: string[] | null;
        };
        Insert: {
          about?: string | null;
          address: string;
          area?: string | null;
          created_at?: string;
          email: string;
          facilities?: string[] | null;
          fee_range?: number[] | null;
          id?: string;
          is_demo?: boolean;
          languages?: string[] | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          opening_hours?: Json | null;
          phone: string;
          photo_tone?: string | null;
          rating?: number | null;
          review_count?: number | null;
          services?: string[] | null;
          specialty_ids?: string[] | null;
        };
        Update: {
          about?: string | null;
          address?: string;
          area?: string | null;
          created_at?: string;
          email?: string;
          facilities?: string[] | null;
          fee_range?: number[] | null;
          id?: string;
          is_demo?: boolean;
          languages?: string[] | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          opening_hours?: Json | null;
          phone?: string;
          photo_tone?: string | null;
          rating?: number | null;
          review_count?: number | null;
          services?: string[] | null;
          specialty_ids?: string[] | null;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          appointment_id: string | null;
          clinic_id: string;
          created_at: string;
          doctor_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["conversation_kind"];
          patient_id: string;
          unread_for_clinic: number;
          unread_for_patient: number;
        };
        Insert: {
          appointment_id?: string | null;
          clinic_id: string;
          created_at?: string;
          doctor_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["conversation_kind"];
          patient_id: string;
          unread_for_clinic?: number;
          unread_for_patient?: number;
        };
        Update: {
          appointment_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          doctor_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["conversation_kind"];
          patient_id?: string;
          unread_for_clinic?: number;
          unread_for_patient?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      doctor_schedules: {
        Row: {
          clinic_id: string;
          created_at: string;
          day_of_week: number;
          doctor_id: string;
          end_time: string;
          id: string;
          slot_minutes: number;
          start_time: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          day_of_week: number;
          doctor_id: string;
          end_time: string;
          id?: string;
          slot_minutes?: number;
          start_time: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          day_of_week?: number;
          doctor_id?: string;
          end_time?: string;
          id?: string;
          slot_minutes?: number;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_schedules_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_schedules_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
        ];
      };
      doctors: {
        Row: {
          about: string | null;
          consultation_fee: number;
          created_at: string;
          experience_years: number;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          is_demo: boolean;
          languages: string[] | null;
          name: string;
          qualifications: string[] | null;
          rating: number | null;
          registration_note: string | null;
          review_count: number | null;
          services: string[] | null;
          specialty_id: string | null;
          user_id: string | null;
        };
        Insert: {
          about?: string | null;
          consultation_fee?: number;
          created_at?: string;
          experience_years?: number;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_demo?: boolean;
          languages?: string[] | null;
          name: string;
          qualifications?: string[] | null;
          rating?: number | null;
          registration_note?: string | null;
          review_count?: number | null;
          services?: string[] | null;
          specialty_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          about?: string | null;
          consultation_fee?: number;
          created_at?: string;
          experience_years?: number;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_demo?: boolean;
          languages?: string[] | null;
          name?: string;
          qualifications?: string[] | null;
          rating?: number | null;
          registration_note?: string | null;
          review_count?: number | null;
          services?: string[] | null;
          specialty_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          read: boolean;
          title: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          read?: boolean;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          read?: boolean;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          area: string | null;
          created_at: string;
          date_of_birth: string | null;
          full_name: string;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          is_demo: boolean;
          preferred_language: string | null;
          saved_clinic_ids: string[] | null;
          saved_doctor_ids: string[] | null;
          user_id: string;
        };
        Insert: {
          area?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          full_name: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_demo?: boolean;
          preferred_language?: string | null;
          saved_clinic_ids?: string[] | null;
          saved_doctor_ids?: string[] | null;
          user_id: string;
        };
        Update: {
          area?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_demo?: boolean;
          preferred_language?: string | null;
          saved_clinic_ids?: string[] | null;
          saved_doctor_ids?: string[] | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      // Private provider-candidate review (migration 00056, local, not yet deployed). Platform
      // admins only. Research facts are written by the owner-run import; the UI updates review state.
      candidate_facilities: {
        Row: {
          address: string | null;
          booking_enabled: false;
          created_at: string;
          facility_type: string;
          id: string;
          locality: string;
          name: string;
          notes: string | null;
          permission_status: "unknown" | "requested" | "granted" | "denied";
          research_id: string;
          researched_on: string;
          review_status:
            | "candidate"
            | "under_review"
            | "contact_pending"
            | "contacted"
            | "verification_pending"
            | "verified"
            | "rejected";
          source_confidence: "high" | "medium" | "low";
          specialties: string[];
          unresolved_issues: string[];
          updated_at: string;
          website: string | null;
        };
        Insert: never;
        Update: {
          notes?: string | null;
          permission_status?: "unknown" | "requested" | "granted" | "denied";
          review_status?:
            | "candidate"
            | "under_review"
            | "contact_pending"
            | "contacted"
            | "verification_pending"
            | "verified"
            | "rejected";
        };
        Relationships: [];
      };
      candidate_doctors: {
        Row: {
          booking_enabled: false;
          created_at: string;
          full_name: string;
          id: string;
          notes: string | null;
          permission_status: "unknown" | "requested" | "granted" | "denied";
          qualifications: string | null;
          registration_info: string | null;
          registration_status: "not_verified" | "public_listing_seen" | "verified";
          research_id: string;
          researched_on: string;
          review_status:
            | "candidate"
            | "under_review"
            | "contact_pending"
            | "contacted"
            | "verification_pending"
            | "verified"
            | "rejected";
          source_confidence: "high" | "medium" | "low";
          specialty: string;
          unresolved_issues: string[];
          updated_at: string;
        };
        Insert: never;
        Update: {
          notes?: string | null;
          permission_status?: "unknown" | "requested" | "granted" | "denied";
          review_status?:
            | "candidate"
            | "under_review"
            | "contact_pending"
            | "contacted"
            | "verification_pending"
            | "verified"
            | "rejected";
        };
        Relationships: [];
      };
      candidate_relationships: {
        Row: {
          careconnect_status: "unverified" | "confirmed" | "rejected";
          confidence: "high" | "medium" | "low";
          created_at: string;
          doctor_candidate_id: string;
          facility_candidate_id: string;
          id: string;
          notes: string | null;
          research_status: "CONFIRMED_PUBLIC" | "POSSIBLE_NEEDS_CONFIRMATION";
          unresolved_issues: string[];
          updated_at: string;
        };
        Insert: never;
        Update: {
          careconnect_status?: "unverified" | "confirmed" | "rejected";
          notes?: string | null;
        };
        Relationships: [];
      };
      candidate_sources: {
        Row: {
          confidence: "high" | "medium" | "low";
          created_at: string;
          doctor_candidate_id: string | null;
          facility_candidate_id: string | null;
          id: string;
          origin: "research" | "admin";
          relationship_id: string | null;
          researched_on: string;
          source_type:
            | "official_facility"
            | "official_institution"
            | "government_registry"
            | "directory"
            | "news"
            | "other";
          supports: string;
          url: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      candidate_evidence: {
        Row: {
          doctor_candidate_id: string | null;
          evidence_type:
            | "provider_identity"
            | "clinic_identity"
            | "doctor_registration"
            | "doctor_clinic_relationship"
            | "address"
            | "contact_details"
            | "listing_permission"
            | "appointment_arrangement";
          facility_candidate_id: string | null;
          id: string;
          recorded_at: string;
          recorded_by: string;
          relationship_id: string | null;
          source: string;
          value: string;
        };
        Insert: {
          doctor_candidate_id?: string | null;
          evidence_type: Database["public"]["Tables"]["candidate_evidence"]["Row"]["evidence_type"];
          facility_candidate_id?: string | null;
          relationship_id?: string | null;
          source: string;
          value: string;
        };
        Update: never;
        Relationships: [];
      };
      candidate_contacts: {
        Row: {
          contacted_on: string;
          doctor_candidate_id: string | null;
          facility_candidate_id: string | null;
          id: string;
          method: "phone" | "email" | "in_person" | "website_form" | "other";
          notes: string | null;
          outcome:
            "no_response" | "reached" | "interested" | "declined" | "follow_up" | "wrong_contact";
          permission_status: "unknown" | "requested" | "granted" | "denied";
          recorded_at: string;
          recorded_by: string;
        };
        Insert: {
          contacted_on: string;
          doctor_candidate_id?: string | null;
          facility_candidate_id?: string | null;
          method: Database["public"]["Tables"]["candidate_contacts"]["Row"]["method"];
          notes?: string | null;
          outcome: Database["public"]["Tables"]["candidate_contacts"]["Row"]["outcome"];
          permission_status?: "unknown" | "requested" | "granted" | "denied";
        };
        Update: never;
        Relationships: [];
      };
      // Added by migration 00055 (local, not yet deployed). Applicants insert content columns only.
      doctor_applications: {
        Row: {
          applicant_id: string;
          clinic_id: string | null;
          clinic_note: string | null;
          consultation_fee: number | null;
          contact_email: string;
          contact_phone: string;
          created_at: string;
          doctor_id: string | null;
          experience_years: number;
          full_name: string;
          id: string;
          message: string | null;
          qualifications: string;
          registration_council: string;
          registration_number: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          specialty_id: string;
          status: "submitted" | "approved" | "rejected" | "withdrawn";
          updated_at: string;
        };
        Insert: {
          clinic_id?: string | null;
          clinic_note?: string | null;
          consultation_fee?: number | null;
          contact_email: string;
          contact_phone: string;
          experience_years: number;
          full_name: string;
          message?: string | null;
          qualifications: string;
          registration_council: string;
          registration_number: string;
          specialty_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "doctor_applications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      // Added by migration 00054 (local, not yet deployed). Applicants may insert only the content
      // columns; status, owner and review fields come from defaults and the review functions.
      provider_applications: {
        Row: {
          address: string;
          applicant_id: string;
          area: string;
          clinic_id: string | null;
          clinic_name: string;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          contact_role: "owner" | "administrator" | "doctor" | "manager" | "other";
          created_at: string;
          doctor_count: number | null;
          id: string;
          message: string | null;
          registration_details: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: "submitted" | "approved" | "rejected" | "withdrawn";
          updated_at: string;
        };
        Insert: {
          address: string;
          area: string;
          clinic_name: string;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          contact_role: "owner" | "administrator" | "doctor" | "manager" | "other";
          doctor_count?: number | null;
          message?: string | null;
          registration_details: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "provider_applications_applicant_id_fkey";
            columns: ["applicant_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_applications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["user_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database["public"]["Enums"]["user_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["user_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          auth_id: string | null;
          consent_timestamp: string | null;
          created_at: string;
          data_deletion_requested: boolean | null;
          email: string;
          id: string;
          is_demo: boolean;
          phone: string | null;
          privacy_policy_version: string | null;
          terms_version: string | null;
          updated_at: string;
        };
        Insert: {
          auth_id?: string | null;
          consent_timestamp?: string | null;
          created_at?: string;
          data_deletion_requested?: boolean | null;
          email: string;
          id: string;
          is_demo?: boolean;
          phone?: string | null;
          privacy_policy_version?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_id?: string | null;
          consent_timestamp?: string | null;
          created_at?: string;
          data_deletion_requested?: boolean | null;
          email?: string;
          id?: string;
          is_demo?: boolean;
          phone?: string | null;
          privacy_policy_version?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      book_appointment: {
        Args: {
          p_clinic_id: string;
          p_date: string;
          p_doctor_id: string;
          p_reason: string;
          p_time: string;
        };
        Returns: {
          clinic_id: string;
          created_at: string;
          date: string;
          doctor_id: string;
          fee: number;
          id: string;
          patient_id: string;
          reason: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          time: string;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_doctor_availability: {
        Args: { p_date: string; p_doctor_id: string };
        Returns: {
          available_time: string;
        }[];
      };
      get_doctor_slots:
        | {
            Args: { p_date: string; p_doctor_id: string };
            Returns: {
              available: boolean;
              slot_time: string;
            }[];
          }
        | {
            // Clinic-aware overload added in migration 00047 (the one the app calls).
            Args: { p_clinic_id: string; p_date: string; p_doctor_id: string };
            Returns: {
              available: boolean;
              slot_time: string;
            }[];
          };
      // Doctor portal functions from migration 00055 (local, not yet deployed).
      admin_review_doctor_application: {
        Args: {
          p_application_id: string;
          p_approve: boolean;
          p_note: string | null;
          p_existing_doctor_id?: string | null;
        };
        Returns: string | null;
      };
      doctor_appointments: {
        Args: Record<string, never>;
        Returns: {
          clinic_id: string;
          clinic_name: string;
          date: string;
          id: string;
          patient_name: string;
          reason: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          time: string;
        }[];
      };
      doctor_conversations: {
        Args: Record<string, never>;
        Returns: {
          clinic_id: string;
          clinic_name: string;
          created_at: string;
          id: string;
          messages: Json;
          patient_name: string;
        }[];
      };
      withdraw_doctor_application: { Args: { p_application_id: string }; Returns: undefined };
      // Onboarding functions from migration 00054 (local, not yet deployed).
      admin_add_clinic_member: {
        Args: { p_clinic_id: string; p_email: string; p_role: string };
        Returns: string;
      };
      admin_review_provider_application: {
        Args: { p_application_id: string; p_approve: boolean; p_note: string | null };
        Returns: string | null;
      };
      clinic_propose_doctor: {
        Args: {
          p_about: string | null;
          p_clinic_id: string;
          p_consultation_fee: number;
          p_experience_years: number;
          p_gender: string | null;
          p_languages: string[];
          p_name: string;
          p_qualifications: string[];
          p_registration_note: string;
          p_specialty_id: string;
        };
        Returns: string;
      };
      withdraw_provider_application: { Args: { p_application_id: string }; Returns: undefined };
      toggle_saved_clinic: { Args: { p_clinic_id: string }; Returns: string[] };
      toggle_saved_doctor: { Args: { p_doctor_id: string }; Returns: string[] };
    };
    Enums: {
      appointment_status: "pending" | "confirmed" | "arrived" | "completed" | "cancelled";
      conversation_kind: "appointment" | "general";
      gender_type: "male" | "female" | "other";
      user_role: "patient" | "doctor" | "clinic_staff" | "clinic_admin" | "platform_admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      appointment_status: ["pending", "confirmed", "arrived", "completed", "cancelled"],
      conversation_kind: ["appointment", "general"],
      gender_type: ["male", "female", "other"],
      user_role: ["patient", "doctor", "clinic_staff", "clinic_admin", "platform_admin"],
    },
  },
} as const;
