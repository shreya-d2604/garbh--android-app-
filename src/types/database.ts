export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_summaries: {
        Row: {
          created_at: string;
          doctor_note: string | null;
          draft: Json | null;
          error: string | null;
          final: Json | null;
          generated_at: string | null;
          id: string;
          input_hash: string | null;
          model: string | null;
          pregnancy_id: string;
          prompt_version: string | null;
          published_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_id: string | null;
          source_type: Database['public']['Enums']['summary_source'];
          status: Database['public']['Enums']['summary_status'];
          token_usage: Json | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doctor_note?: string | null;
          draft?: Json | null;
          error?: string | null;
          final?: Json | null;
          generated_at?: string | null;
          id?: string;
          input_hash?: string | null;
          model?: string | null;
          pregnancy_id: string;
          prompt_version?: string | null;
          published_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_id?: string | null;
          source_type: Database['public']['Enums']['summary_source'];
          status?: Database['public']['Enums']['summary_status'];
          token_usage?: Json | null;
        };
        Update: {
          created_at?: string;
          doctor_note?: string | null;
          draft?: Json | null;
          error?: string | null;
          final?: Json | null;
          generated_at?: string | null;
          id?: string;
          input_hash?: string | null;
          model?: string | null;
          pregnancy_id?: string;
          prompt_version?: string | null;
          published_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['summary_source'];
          status?: Database['public']['Enums']['summary_status'];
          token_usage?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_summaries_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_summaries_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_summaries_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      appointments: {
        Row: {
          booked_by: string | null;
          booking_channel: Database['public']['Enums']['booking_channel'];
          cancelled_by: string | null;
          cancelled_reason: string | null;
          checked_in_at: string | null;
          created_at: string;
          doctor_id: string;
          ends_at: string;
          id: string;
          notes_for_patient: string | null;
          patient_id: string;
          pregnancy_id: string;
          reason: string | null;
          reminder_24h_sent_at: string | null;
          reminder_2h_sent_at: string | null;
          rescheduled_from: string | null;
          starts_at: string;
          status: Database['public']['Enums']['appt_status'];
          updated_at: string;
          visit_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          booked_by?: string | null;
          booking_channel: Database['public']['Enums']['booking_channel'];
          cancelled_by?: string | null;
          cancelled_reason?: string | null;
          checked_in_at?: string | null;
          created_at?: string;
          doctor_id: string;
          ends_at: string;
          id?: string;
          notes_for_patient?: string | null;
          patient_id: string;
          pregnancy_id: string;
          reason?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          rescheduled_from?: string | null;
          starts_at: string;
          status?: Database['public']['Enums']['appt_status'];
          updated_at?: string;
          visit_id?: string | null;
        };
        Update: {
          booked_by?: string | null;
          booking_channel?: Database['public']['Enums']['booking_channel'];
          cancelled_by?: string | null;
          cancelled_reason?: string | null;
          checked_in_at?: string | null;
          created_at?: string;
          doctor_id?: string;
          ends_at?: string;
          id?: string;
          notes_for_patient?: string | null;
          patient_id?: string;
          pregnancy_id?: string;
          reason?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          rescheduled_from?: string | null;
          starts_at?: string;
          status?: Database['public']['Enums']['appt_status'];
          updated_at?: string;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'appointments_booked_by_fkey';
            columns: ['booked_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_booked_by_fkey';
            columns: ['booked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_rescheduled_from_fkey';
            columns: ['rescheduled_from'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_visit_id_fkey';
            columns: ['visit_id'];
            isOneToOne: false;
            referencedRelation: 'visits';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: Database['public']['Enums']['user_role'] | null;
          at: string;
          id: number;
          new: Json | null;
          old: Json | null;
          patient_id: string | null;
          record_id: string | null;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: Database['public']['Enums']['user_role'] | null;
          at?: string;
          id?: never;
          new?: Json | null;
          old?: Json | null;
          patient_id?: string | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: Database['public']['Enums']['user_role'] | null;
          at?: string;
          id?: never;
          new?: Json | null;
          old?: Json | null;
          patient_id?: string | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      care_team: {
        Row: {
          added_at: string;
          added_by: string | null;
          care_role: Database['public']['Enums']['care_role'];
          doctor_id: string;
          id: string;
          note: string | null;
          pregnancy_id: string;
          removed_at: string | null;
          removed_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          added_by?: string | null;
          care_role: Database['public']['Enums']['care_role'];
          doctor_id: string;
          id?: string;
          note?: string | null;
          pregnancy_id: string;
          removed_at?: string | null;
          removed_by?: string | null;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          care_role?: Database['public']['Enums']['care_role'];
          doctor_id?: string;
          id?: string;
          note?: string | null;
          pregnancy_id?: string;
          removed_at?: string | null;
          removed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'care_team_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_removed_by_fkey';
            columns: ['removed_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_team_removed_by_fkey';
            columns: ['removed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      code_redeem_attempts: {
        Row: {
          attempted_at: string;
          id: string;
          success: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempted_at?: string;
          id?: string;
          success: boolean;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          id?: string;
          success?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'code_redeem_attempts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'code_redeem_attempts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      companion_invites: {
        Row: {
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          max_uses: number;
          patient_id: string;
          revoked_at: string | null;
          used_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          code_hash: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_uses?: number;
          patient_id: string;
          revoked_at?: string | null;
          used_at?: string | null;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_uses?: number;
          patient_id?: string;
          revoked_at?: string | null;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'companion_invites_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
        ];
      };
      companion_links: {
        Row: {
          can_view_appointments: boolean;
          can_view_journey: boolean;
          can_view_prescriptions: boolean;
          can_view_reports: boolean;
          can_view_summaries: boolean;
          companion_user_id: string;
          decided_at: string | null;
          id: string;
          patient_id: string;
          receive_notifications: boolean;
          relation: string;
          relation_note: string | null;
          requested_at: string;
          status: Database['public']['Enums']['link_status'];
        };
        ComputedFields: never;
        Insert: {
          can_view_appointments?: boolean;
          can_view_journey?: boolean;
          can_view_prescriptions?: boolean;
          can_view_reports?: boolean;
          can_view_summaries?: boolean;
          companion_user_id: string;
          decided_at?: string | null;
          id?: string;
          patient_id: string;
          receive_notifications?: boolean;
          relation: string;
          relation_note?: string | null;
          requested_at?: string;
          status?: Database['public']['Enums']['link_status'];
        };
        Update: {
          can_view_appointments?: boolean;
          can_view_journey?: boolean;
          can_view_prescriptions?: boolean;
          can_view_reports?: boolean;
          can_view_summaries?: boolean;
          companion_user_id?: string;
          decided_at?: string | null;
          id?: string;
          patient_id?: string;
          receive_notifications?: boolean;
          relation?: string;
          relation_note?: string | null;
          requested_at?: string;
          status?: Database['public']['Enums']['link_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'companion_links_companion_user_id_fkey';
            columns: ['companion_user_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'companion_links_companion_user_id_fkey';
            columns: ['companion_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'companion_links_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
        ];
      };
      consultation_private_notes: {
        Row: {
          consultation_id: string;
          note: string;
          pregnancy_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          consultation_id: string;
          note: string;
          pregnancy_id: string;
          updated_at?: string;
        };
        Update: {
          consultation_id?: string;
          note?: string;
          pregnancy_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consultation_private_notes_consultation_id_fkey';
            columns: ['consultation_id'];
            isOneToOne: true;
            referencedRelation: 'consultations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consultation_private_notes_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
        ];
      };
      consultations: {
        Row: {
          advice: string | null;
          appointment_id: string | null;
          bp_diastolic: number | null;
          bp_systolic: number | null;
          complaints: string | null;
          created_at: string;
          diet_advice: string | null;
          doctor_id: string;
          edema: string | null;
          fetal_heart_rate: number | null;
          fetal_movements: string | null;
          findings: string | null;
          fundal_height_cm: number | null;
          ga_days: number | null;
          ga_weeks: number | null;
          id: string;
          next_visit_after_weeks: number | null;
          pregnancy_id: string;
          presentation: string | null;
          published_at: string | null;
          pulse: number | null;
          spo2: number | null;
          temperature: number | null;
          updated_at: string;
          urine_albumin: string | null;
          urine_sugar: string | null;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          advice?: string | null;
          appointment_id?: string | null;
          bp_diastolic?: number | null;
          bp_systolic?: number | null;
          complaints?: string | null;
          created_at?: string;
          diet_advice?: string | null;
          doctor_id: string;
          edema?: string | null;
          fetal_heart_rate?: number | null;
          fetal_movements?: string | null;
          findings?: string | null;
          fundal_height_cm?: number | null;
          ga_days?: number | null;
          ga_weeks?: number | null;
          id?: string;
          next_visit_after_weeks?: number | null;
          pregnancy_id: string;
          presentation?: string | null;
          published_at?: string | null;
          pulse?: number | null;
          spo2?: number | null;
          temperature?: number | null;
          updated_at?: string;
          urine_albumin?: string | null;
          urine_sugar?: string | null;
          weight_kg?: number | null;
        };
        Update: {
          advice?: string | null;
          appointment_id?: string | null;
          bp_diastolic?: number | null;
          bp_systolic?: number | null;
          complaints?: string | null;
          created_at?: string;
          diet_advice?: string | null;
          doctor_id?: string;
          edema?: string | null;
          fetal_heart_rate?: number | null;
          fetal_movements?: string | null;
          findings?: string | null;
          fundal_height_cm?: number | null;
          ga_days?: number | null;
          ga_weeks?: number | null;
          id?: string;
          next_visit_after_weeks?: number | null;
          pregnancy_id?: string;
          presentation?: string | null;
          published_at?: string | null;
          pulse?: number | null;
          spo2?: number | null;
          temperature?: number | null;
          updated_at?: string;
          urine_albumin?: string | null;
          urine_sugar?: string | null;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'consultations_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: true;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consultations_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consultations_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consultations_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
        ];
      };
      curated_guidance: {
        Row: {
          condition: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          reason: string | null;
          text: string;
          trimester: number | null;
        };
        ComputedFields: never;
        Insert: {
          condition?: string | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          reason?: string | null;
          text: string;
          trimester?: number | null;
        };
        Update: {
          condition?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          reason?: string | null;
          text?: string;
          trimester?: number | null;
        };
        Relationships: [];
      };
      data_requests: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'data_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      doctor_availability: {
        Row: {
          doctor_id: string;
          end_time: string;
          id: string;
          slot_minutes: number;
          start_time: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          doctor_id: string;
          end_time: string;
          id?: string;
          slot_minutes?: number;
          start_time: string;
          weekday: number;
        };
        Update: {
          doctor_id?: string;
          end_time?: string;
          id?: string;
          slot_minutes?: number;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'doctor_availability_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'doctor_availability_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      doctor_time_off: {
        Row: {
          created_at: string;
          doctor_id: string;
          ends_at: string;
          id: string;
          reason: string | null;
          starts_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doctor_id: string;
          ends_at: string;
          id?: string;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          doctor_id?: string;
          ends_at?: string;
          id?: string;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'doctor_time_off_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'doctor_time_off_doctor_id_fkey';
            columns: ['doctor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      drug_catalog: {
        Row: {
          common_strengths: string[];
          generic: string | null;
          id: string;
          is_active: boolean;
          name: string;
          pregnancy_caution_note: string | null;
        };
        ComputedFields: never;
        Insert: {
          common_strengths?: string[];
          generic?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          pregnancy_caution_note?: string | null;
        };
        Update: {
          common_strengths?: string[];
          generic?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          pregnancy_caution_note?: string | null;
        };
        Relationships: [];
      };
      hospital_settings: {
        Row: {
          address: string | null;
          default_slot_minutes: number;
          id: number;
          logo_path: string | null;
          max_advance_days: number;
          min_lead_hours: number;
          name: string;
          patient_cancel_cutoff_hours: number;
          phone: string | null;
          reminder_lead_hours: number[];
          timezone: string;
          unverified_max_upcoming: number;
          updated_at: string;
          verified_max_upcoming: number;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          default_slot_minutes?: number;
          id?: number;
          logo_path?: string | null;
          max_advance_days?: number;
          min_lead_hours?: number;
          name: string;
          patient_cancel_cutoff_hours?: number;
          phone?: string | null;
          reminder_lead_hours?: number[];
          timezone?: string;
          unverified_max_upcoming?: number;
          updated_at?: string;
          verified_max_upcoming?: number;
        };
        Update: {
          address?: string | null;
          default_slot_minutes?: number;
          id?: number;
          logo_path?: string | null;
          max_advance_days?: number;
          min_lead_hours?: number;
          name?: string;
          patient_cancel_cutoff_hours?: number;
          phone?: string | null;
          reminder_lead_hours?: number[];
          timezone?: string;
          unverified_max_upcoming?: number;
          updated_at?: string;
          verified_max_upcoming?: number;
        };
        Relationships: [];
      };
      lab_results: {
        Row: {
          confidence: number | null;
          created_at: string;
          flag: string | null;
          id: string;
          observed_on: string | null;
          pregnancy_id: string;
          raw_name: string | null;
          ref_high: number | null;
          ref_low: number | null;
          report_id: string | null;
          source: Database['public']['Enums']['result_source'];
          test_code: string | null;
          unit: string | null;
          value_num: number | null;
          value_text: string | null;
          verified: boolean;
          verified_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          confidence?: number | null;
          created_at?: string;
          flag?: string | null;
          id?: string;
          observed_on?: string | null;
          pregnancy_id: string;
          raw_name?: string | null;
          ref_high?: number | null;
          ref_low?: number | null;
          report_id?: string | null;
          source: Database['public']['Enums']['result_source'];
          test_code?: string | null;
          unit?: string | null;
          value_num?: number | null;
          value_text?: string | null;
          verified?: boolean;
          verified_by?: string | null;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          flag?: string | null;
          id?: string;
          observed_on?: string | null;
          pregnancy_id?: string;
          raw_name?: string | null;
          ref_high?: number | null;
          ref_low?: number | null;
          report_id?: string | null;
          source?: Database['public']['Enums']['result_source'];
          test_code?: string | null;
          unit?: string | null;
          value_num?: number | null;
          value_text?: string | null;
          verified?: boolean;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'lab_results_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lab_results_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lab_results_test_code_fkey';
            columns: ['test_code'];
            isOneToOne: false;
            referencedRelation: 'lab_tests';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'lab_results_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lab_results_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lab_tests: {
        Row: {
          code: string;
          is_active: boolean;
          name: string;
          ref_high: number | null;
          ref_low: number | null;
          trimester_ref: Json | null;
          unit: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          is_active?: boolean;
          name: string;
          ref_high?: number | null;
          ref_low?: number | null;
          trimester_ref?: Json | null;
          unit?: string | null;
        };
        Update: {
          code?: string;
          is_active?: boolean;
          name?: string;
          ref_high?: number | null;
          ref_low?: number | null;
          trimester_ref?: Json | null;
          unit?: string | null;
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          category: string;
          description: string | null;
          key: string;
          title: string;
          week_from: number;
          week_to: number;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          description?: string | null;
          key: string;
          title: string;
          week_from: number;
          week_to: number;
        };
        Update: {
          category?: string;
          description?: string | null;
          key?: string;
          title?: string;
          week_from?: number;
          week_to?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          data: NonNullable<Json>;
          id: string;
          push_error: string | null;
          push_sent_at: string | null;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          push_error?: string | null;
          push_sent_at?: string | null;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          push_error?: string | null;
          push_sent_at?: string | null;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      patients: {
        Row: {
          address: string | null;
          allergies: string[];
          blood_group: string | null;
          chronic_conditions: string[];
          consent_ai_at: string | null;
          consent_data_at: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          dob: string | null;
          email: string | null;
          emergency_contact: string | null;
          full_name: string;
          id: string;
          is_verified: boolean | null;
          mrn: string | null;
          phone: string | null;
          registration_source: string;
          rh_negative: boolean | null;
          updated_at: string;
          user_id: string | null;
          verified_at: string | null;
          verified_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          allergies?: string[];
          blood_group?: string | null;
          chronic_conditions?: string[];
          consent_ai_at?: string | null;
          consent_data_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dob?: string | null;
          email?: string | null;
          emergency_contact?: string | null;
          full_name: string;
          id?: string;
          is_verified?: never;
          mrn?: string | null;
          phone?: string | null;
          registration_source: string;
          rh_negative?: boolean | null;
          updated_at?: string;
          user_id?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          address?: string | null;
          allergies?: string[];
          blood_group?: string | null;
          chronic_conditions?: string[];
          consent_ai_at?: string | null;
          consent_data_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dob?: string | null;
          email?: string | null;
          emergency_contact?: string | null;
          full_name?: string;
          id?: string;
          is_verified?: never;
          mrn?: string | null;
          phone?: string | null;
          registration_source?: string;
          rh_negative?: boolean | null;
          updated_at?: string;
          user_id?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'patients_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patients_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pregnancies: {
        Row: {
          abortus: number | null;
          created_at: string;
          edd_final: string | null;
          edd_lmp: string | null;
          edd_usg: string | null;
          gravida: number | null;
          id: string;
          living: number | null;
          lmp_date: string | null;
          lmp_source: string;
          multiple_gestation: number;
          outcome_date: string | null;
          outcome_notes: string | null;
          para: number | null;
          patient_id: string;
          risk_factors: string[];
          risk_level: Database['public']['Enums']['risk_level'];
          status: Database['public']['Enums']['pregnancy_status'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          abortus?: number | null;
          created_at?: string;
          edd_final?: never;
          edd_lmp?: never;
          edd_usg?: string | null;
          gravida?: number | null;
          id?: string;
          living?: number | null;
          lmp_date?: string | null;
          lmp_source?: string;
          multiple_gestation?: number;
          outcome_date?: string | null;
          outcome_notes?: string | null;
          para?: number | null;
          patient_id: string;
          risk_factors?: string[];
          risk_level?: Database['public']['Enums']['risk_level'];
          status?: Database['public']['Enums']['pregnancy_status'];
          updated_at?: string;
        };
        Update: {
          abortus?: number | null;
          created_at?: string;
          edd_final?: never;
          edd_lmp?: never;
          edd_usg?: string | null;
          gravida?: number | null;
          id?: string;
          living?: number | null;
          lmp_date?: string | null;
          lmp_source?: string;
          multiple_gestation?: number;
          outcome_date?: string | null;
          outcome_notes?: string | null;
          para?: number | null;
          patient_id?: string;
          risk_factors?: string[];
          risk_level?: Database['public']['Enums']['risk_level'];
          status?: Database['public']['Enums']['pregnancy_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pregnancies_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
        ];
      };
      prescription_items: {
        Row: {
          consultation_id: string;
          created_at: string;
          dosage_form: string | null;
          dose: string | null;
          drug_name: string;
          duration_days: number | null;
          end_date: string | null;
          frequency: string | null;
          id: string;
          instructions: string | null;
          is_active: boolean | null;
          pregnancy_id: string;
          route: string | null;
          start_date: string | null;
          stopped_at: string | null;
          strength: string | null;
          timing: string | null;
        };
        ComputedFields: never;
        Insert: {
          consultation_id: string;
          created_at?: string;
          dosage_form?: string | null;
          dose?: string | null;
          drug_name: string;
          duration_days?: number | null;
          end_date?: never;
          frequency?: string | null;
          id?: string;
          instructions?: string | null;
          is_active?: never;
          pregnancy_id: string;
          route?: string | null;
          start_date?: string | null;
          stopped_at?: string | null;
          strength?: string | null;
          timing?: string | null;
        };
        Update: {
          consultation_id?: string;
          created_at?: string;
          dosage_form?: string | null;
          dose?: string | null;
          drug_name?: string;
          duration_days?: number | null;
          end_date?: never;
          frequency?: string | null;
          id?: string;
          instructions?: string | null;
          is_active?: never;
          pregnancy_id?: string;
          route?: string | null;
          start_date?: string | null;
          stopped_at?: string | null;
          strength?: string | null;
          timing?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prescription_items_consultation_id_fkey';
            columns: ['consultation_id'];
            isOneToOne: false;
            referencedRelation: 'consultations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prescription_items_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          consent_at: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          is_active: boolean;
          phone: string | null;
          role: Database['public']['Enums']['user_role'] | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          consent_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'] | null;
        };
        Update: {
          avatar_path?: string | null;
          consent_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'] | null;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          expo_push_token: string;
          id: string;
          last_seen_at: string;
          platform: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expo_push_token: string;
          id?: string;
          last_seen_at?: string;
          platform?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expo_push_token?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      report_files: {
        Row: {
          created_at: string;
          id: string;
          mime_type: string;
          page_no: number;
          report_id: string;
          size_bytes: number | null;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          mime_type: string;
          page_no?: number;
          report_id: string;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mime_type?: string;
          page_no?: number;
          report_id?: string;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_files_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          consultation_id: string | null;
          created_at: string;
          deleted_at: string | null;
          doctor_comment: string | null;
          extraction_error: string | null;
          extraction_status: Database['public']['Enums']['extraction_status'];
          id: string;
          lab_name: string | null;
          pregnancy_id: string;
          report_date: string | null;
          title: string | null;
          type: Database['public']['Enums']['report_type'];
          uploaded_by: string | null;
          verified_at: string | null;
          verified_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          consultation_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          doctor_comment?: string | null;
          extraction_error?: string | null;
          extraction_status?: Database['public']['Enums']['extraction_status'];
          id?: string;
          lab_name?: string | null;
          pregnancy_id: string;
          report_date?: string | null;
          title?: string | null;
          type: Database['public']['Enums']['report_type'];
          uploaded_by?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          consultation_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          doctor_comment?: string | null;
          extraction_error?: string | null;
          extraction_status?: Database['public']['Enums']['extraction_status'];
          id?: string;
          lab_name?: string | null;
          pregnancy_id?: string;
          report_date?: string | null;
          title?: string | null;
          type?: Database['public']['Enums']['report_type'];
          uploaded_by?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_consultation_id_fkey';
            columns: ['consultation_id'];
            isOneToOne: false;
            referencedRelation: 'consultations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_details: {
        Row: {
          accepts_new_patients: boolean;
          bio: string | null;
          designation: string | null;
          profile_id: string;
          registration_no: string | null;
          signature_path: string | null;
          specialization: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepts_new_patients?: boolean;
          bio?: string | null;
          designation?: string | null;
          profile_id: string;
          registration_no?: string | null;
          signature_path?: string | null;
          specialization?: string | null;
        };
        Update: {
          accepts_new_patients?: boolean;
          bio?: string | null;
          designation?: string | null;
          profile_id?: string;
          registration_no?: string | null;
          signature_path?: string | null;
          specialization?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_details_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_details_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      visit_templates: {
        Row: {
          id: string;
          is_active: boolean;
          purpose: string | null;
          recommended_tests: string[];
          schedule: string;
          seq: number;
          target_week: number;
          title: string;
          window_end_week: number;
          window_start_week: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          purpose?: string | null;
          recommended_tests?: string[];
          schedule?: string;
          seq: number;
          target_week: number;
          title: string;
          window_end_week: number;
          window_start_week: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          purpose?: string | null;
          recommended_tests?: string[];
          schedule?: string;
          seq?: number;
          target_week?: number;
          title?: string;
          window_end_week?: number;
          window_start_week?: number;
        };
        Relationships: [];
      };
      visits: {
        Row: {
          added_by: string | null;
          appointment_id: string | null;
          contact_note: string | null;
          contacted_at: string | null;
          created_at: string;
          due_from: string | null;
          due_to: string | null;
          id: string;
          is_extra: boolean;
          pregnancy_id: string;
          purpose: string | null;
          reason_added: string | null;
          recommended_tests: string[];
          seq: number;
          status: Database['public']['Enums']['visit_status'];
          target_week: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          appointment_id?: string | null;
          contact_note?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          due_from?: string | null;
          due_to?: string | null;
          id?: string;
          is_extra?: boolean;
          pregnancy_id: string;
          purpose?: string | null;
          reason_added?: string | null;
          recommended_tests?: string[];
          seq: number;
          status?: Database['public']['Enums']['visit_status'];
          target_week: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          added_by?: string | null;
          appointment_id?: string | null;
          contact_note?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          due_from?: string | null;
          due_to?: string | null;
          id?: string;
          is_extra?: boolean;
          pregnancy_id?: string;
          purpose?: string | null;
          reason_added?: string | null;
          recommended_tests?: string[];
          seq?: number;
          status?: Database['public']['Enums']['visit_status'];
          target_week?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visits_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visits_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visits_appointment_fk';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visits_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
        ];
      };
      week_content: {
        Row: {
          baby_development: string | null;
          baby_length_cm: number | null;
          baby_size_label: string | null;
          baby_weight_g: number | null;
          image_path: string | null;
          mother_changes: string | null;
          tips: string | null;
          week: number;
        };
        ComputedFields: never;
        Insert: {
          baby_development?: string | null;
          baby_length_cm?: number | null;
          baby_size_label?: string | null;
          baby_weight_g?: number | null;
          image_path?: string | null;
          mother_changes?: string | null;
          tips?: string | null;
          week: number;
        };
        Update: {
          baby_development?: string | null;
          baby_length_cm?: number | null;
          baby_size_label?: string | null;
          baby_weight_g?: number | null;
          image_path?: string | null;
          mother_changes?: string | null;
          tips?: string | null;
          week?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      doctor_directory: {
        Row: {
          accepts_new_patients: boolean | null;
          avatar_path: string | null;
          bio: string | null;
          designation: string | null;
          full_name: string | null;
          id: string | null;
          specialization: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      published_summaries: {
        Row: {
          final: Json | null;
          id: string | null;
          pregnancy_id: string | null;
          published_at: string | null;
          reviewed_by: string | null;
          source_id: string | null;
          source_type: Database['public']['Enums']['summary_source'] | null;
        };
        ComputedFields: never;
        Insert: {
          final?: never;
          id?: string | null;
          pregnancy_id?: string | null;
          published_at?: string | null;
          reviewed_by?: string | null;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['summary_source'] | null;
        };
        Update: {
          final?: never;
          id?: string | null;
          pregnancy_id?: string | null;
          published_at?: string | null;
          reviewed_by?: string | null;
          source_id?: string | null;
          source_type?: Database['public']['Enums']['summary_source'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_summaries_pregnancy_id_fkey';
            columns: ['pregnancy_id'];
            isOneToOne: false;
            referencedRelation: 'pregnancies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_summaries_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'doctor_directory';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_summaries_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      add_backup_doctor: {
        Args: { p_doctor: string; p_note?: string; p_pregnancy: string };
        Returns: undefined;
      };
      apply_visit_template: {
        Args: { p_pregnancy: string; p_schedule: string };
        Returns: undefined;
      };
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      available_slots: {
        Args: { p_doctor: string; p_from: string; p_to: string };
        Returns: {
          ends_at: string;
          starts_at: string;
        }[];
      };
      book_appointment: {
        Args: {
          p_doctor: string;
          p_pregnancy?: string;
          p_reason?: string;
          p_starts_at: string;
          p_visit?: string;
        };
        Returns: string;
      };
      can_view_pregnancy: {
        Args: { p_companion_perm: string; p_pregnancy: string };
        Returns: boolean;
      };
      cancel_appointment: { Args: { p_appt: string; p_reason: string }; Returns: undefined };
      companion_can: { Args: { p_patient: string; p_perm: string }; Returns: boolean };
      complete_signup: { Args: { p_details: Json; p_kind: string }; Returns: undefined };
      create_companion_invite: { Args: Record<PropertyKey, never>; Returns: string };
      decide_companion_link: {
        Args: { p_approve: boolean; p_link: string; p_perms?: Json };
        Returns: undefined;
      };
      end_companion_link: { Args: { p_link: string }; Returns: undefined };
      ga_from_edd: {
        Args: { p_edd: string; p_on: string };
        Returns: {
          days: number;
          days_to_edd: number;
          trimester: number;
          weeks: number;
        }[];
      };
      generate_visit_plan: { Args: { p_pregnancy: string }; Returns: undefined };
      gestational_age: {
        Args: { p_on?: string; p_pregnancy: string };
        Returns: {
          days: number;
          days_to_edd: number;
          trimester: number;
          weeks: number;
        }[];
      };
      hand_over_primary: {
        Args: { p_new_primary: string; p_pregnancy: string };
        Returns: undefined;
      };
      hospital_today: { Args: Record<PropertyKey, never>; Returns: string };
      is_primary_doctor: { Args: { p_pregnancy: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      log_sensitive_view: {
        Args: { p_patient: string; p_record?: string; p_table: string };
        Returns: undefined;
      };
      merge_patients: { Args: { p_source: string; p_target: string }; Returns: undefined };
      my_patient_id: { Args: Record<PropertyKey, never>; Returns: string };
      on_care_team: { Args: { p_pregnancy: string }; Returns: boolean };
      on_patient_care_team: { Args: { p_patient: string }; Returns: boolean };
      record_consent: { Args: Record<PropertyKey, never>; Returns: undefined };
      redeem_companion_code: { Args: { p_code: string; p_relation: string }; Returns: string };
      remove_care_team_member: {
        Args: { p_doctor: string; p_pregnancy: string };
        Returns: undefined;
      };
      reschedule_appointment: {
        Args: { p_appt: string; p_doctor?: string; p_new_starts_at: string };
        Returns: string;
      };
      review_ai_summary: {
        Args: { p_action: string; p_final?: Json; p_note?: string; p_summary: string };
        Returns: undefined;
      };
      set_appointment_status: {
        Args: { p_appt: string; p_status: Database['public']['Enums']['appt_status'] };
        Returns: undefined;
      };
      verify_patient: {
        Args: { p_merge_into?: string; p_mrn: string; p_patient: string };
        Returns: undefined;
      };
    };
    Enums: {
      appt_status:
        | 'booked'
        | 'confirmed'
        | 'checked_in'
        | 'in_consultation'
        | 'completed'
        | 'cancelled'
        | 'no_show';
      booking_channel: 'app' | 'reception' | 'doctor' | 'admin';
      care_role: 'primary' | 'backup';
      extraction_status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped';
      link_status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'left';
      pregnancy_status:
        'active' | 'delivered' | 'miscarriage' | 'terminated' | 'transferred' | 'closed';
      report_type:
        | 'blood'
        | 'urine'
        | 'ultrasound'
        | 'nt_scan'
        | 'anomaly_scan'
        | 'growth_scan'
        | 'doppler'
        | 'gtt'
        | 'thyroid'
        | 'ecg'
        | 'other';
      result_source: 'ai_extracted' | 'manual';
      risk_level: 'low' | 'moderate' | 'high';
      summary_source: 'report' | 'consultation' | 'cumulative';
      summary_status: 'generating' | 'draft' | 'approved' | 'published' | 'rejected' | 'failed';
      user_role: 'admin' | 'doctor' | 'receptionist' | 'patient' | 'companion';
      visit_status: 'planned' | 'scheduled' | 'completed' | 'missed' | 'skipped' | 'cancelled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      appt_status: [
        'booked',
        'confirmed',
        'checked_in',
        'in_consultation',
        'completed',
        'cancelled',
        'no_show',
      ],
      booking_channel: ['app', 'reception', 'doctor', 'admin'],
      care_role: ['primary', 'backup'],
      extraction_status: ['pending', 'processing', 'done', 'failed', 'skipped'],
      link_status: ['pending', 'approved', 'rejected', 'revoked', 'left'],
      pregnancy_status: [
        'active',
        'delivered',
        'miscarriage',
        'terminated',
        'transferred',
        'closed',
      ],
      report_type: [
        'blood',
        'urine',
        'ultrasound',
        'nt_scan',
        'anomaly_scan',
        'growth_scan',
        'doppler',
        'gtt',
        'thyroid',
        'ecg',
        'other',
      ],
      result_source: ['ai_extracted', 'manual'],
      risk_level: ['low', 'moderate', 'high'],
      summary_source: ['report', 'consultation', 'cumulative'],
      summary_status: ['generating', 'draft', 'approved', 'published', 'rejected', 'failed'],
      user_role: ['admin', 'doctor', 'receptionist', 'patient', 'companion'],
      visit_status: ['planned', 'scheduled', 'completed', 'missed', 'skipped', 'cancelled'],
    },
  },
} as const;
