export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          country: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          country?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          country?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          author_user_id: string | null
          body: string
          country: string
          created_at: string
          email_error: string | null
          email_log_id: string | null
          email_provider_message_id: string | null
          email_sent: boolean
          email_sent_at: string | null
          email_status: string | null
          id: string
          is_public: boolean
          support_request_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          country?: string
          created_at?: string
          email_error?: string | null
          email_log_id?: string | null
          email_provider_message_id?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          email_status?: string | null
          id?: string
          is_public?: boolean
          support_request_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          country?: string
          created_at?: string
          email_error?: string | null
          email_log_id?: string | null
          email_provider_message_id?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          email_status?: string | null
          id?: string
          is_public?: boolean
          support_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_support_request_id_fkey"
            columns: ["support_request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          country: string
          created_at: string
          id: string
          link: string | null
          message: string | null
          metadata: Json
          read_at: string | null
          related_job_id: string | null
          related_lead_id: string | null
          related_report_id: string | null
          related_ticket_id: string | null
          source_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          related_job_id?: string | null
          related_lead_id?: string | null
          related_report_id?: string | null
          related_ticket_id?: string | null
          source_user_id?: string | null
          title: string
          type: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          related_job_id?: string | null
          related_lead_id?: string | null
          related_report_id?: string | null
          related_ticket_id?: string | null
          source_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      bank_transfer_requests: {
        Row: {
          admin_message: string | null
          amount_minor: number
          approved_at: string | null
          bank_name: string
          country: string | null
          country_code: string
          created_at: string
          credits: number
          credits_granted: number | null
          currency: string
          id: string
          note: string | null
          package_id: string
          payment_date: string
          professional_id: string
          receipt_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_account_name: string
          status: string
          transfer_reference: string
          user_id: string
        }
        Insert: {
          admin_message?: string | null
          amount_minor: number
          approved_at?: string | null
          bank_name: string
          country?: string | null
          country_code?: string
          created_at?: string
          credits: number
          credits_granted?: number | null
          currency?: string
          id?: string
          note?: string | null
          package_id: string
          payment_date: string
          professional_id: string
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_account_name: string
          status?: string
          transfer_reference: string
          user_id: string
        }
        Update: {
          admin_message?: string | null
          amount_minor?: number
          approved_at?: string | null
          bank_name?: string
          country?: string | null
          country_code?: string
          created_at?: string
          credits?: number
          credits_granted?: number | null
          currency?: string
          id?: string
          note?: string | null
          package_id?: string
          payment_date?: string
          professional_id?: string
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_account_name?: string
          status?: string
          transfer_reference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfer_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "bank_transfer_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      banned_emails: {
        Row: {
          banned_at: string
          banned_by: string | null
          country: string | null
          email: string
          reason: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          country?: string | null
          email: string
          reason: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          country?: string | null
          email?: string
          reason?: string
        }
        Relationships: []
      }
      client_notification_prefs: {
        Row: {
          created_at: string
          email_new_message: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_new_message?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_new_message?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_phone_otps: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          user_id: string
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      coming_soon_signups: {
        Row: {
          country_code: string
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      credit_settings: {
        Row: {
          id: number
          lead_expiry_days: number
          packages: Json
          priority_radius_miles: number
          subscription: Json
          unlock_cost: number
          updated_at: string
          welcome_bonus: number
        }
        Insert: {
          id?: number
          lead_expiry_days?: number
          packages?: Json
          priority_radius_miles?: number
          subscription?: Json
          unlock_cost?: number
          updated_at?: string
          welcome_bonus?: number
        }
        Update: {
          id?: number
          lead_expiry_days?: number
          packages?: Json
          priority_radius_miles?: number
          subscription?: Json
          unlock_cost?: number
          updated_at?: string
          welcome_bonus?: number
        }
        Relationships: []
      }
      credit_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          country: string
          created_at: string
          credits_per_period: number
          current_period_end: string | null
          environment: string
          id: string
          price_id: string
          professional_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          country?: string
          created_at?: string
          credits_per_period?: number
          current_period_end?: string | null
          environment?: string
          id?: string
          price_id: string
          professional_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          country?: string
          created_at?: string
          credits_per_period?: number
          current_period_end?: string | null
          environment?: string
          id?: string
          price_id?: string
          professional_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_subscriptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "credit_subscriptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          country: string
          created_at: string
          description: string | null
          id: string
          professional_id: string
          stripe_payment_id: string | null
          transaction_type: Database["public"]["Enums"]["credit_tx_type"]
        }
        Insert: {
          amount: number
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id: string
          stripe_payment_id?: string | null
          transaction_type: Database["public"]["Enums"]["credit_tx_type"]
        }
        Update: {
          amount?: number
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id?: string
          stripe_payment_id?: string | null
          transaction_type?: Database["public"]["Enums"]["credit_tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "credit_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      favourites: {
        Row: {
          country: string
          created_at: string
          customer_id: string
          professional_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          customer_id: string
          professional_id: string
        }
        Update: {
          country?: string
          created_at?: string
          customer_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "favourites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bank_details: string | null
          brand_color: string | null
          business_name: string | null
          client_email: string | null
          client_name: string
          country: string
          created_at: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          line_items: Json
          logo_url: string | null
          notes: string | null
          paid_at: string | null
          payment_links: Json
          project_description: string | null
          sent_at: string | null
          show_bank_details: boolean
          show_payment_links: boolean
          status: string
          subtotal_pence: number
          tax_enabled: boolean
          tax_pence: number
          tax_rate: number
          total_pence: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_details?: string | null
          brand_color?: string | null
          business_name?: string | null
          client_email?: string | null
          client_name: string
          country?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          line_items?: Json
          logo_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_links?: Json
          project_description?: string | null
          sent_at?: string | null
          show_bank_details?: boolean
          show_payment_links?: boolean
          status?: string
          subtotal_pence?: number
          tax_enabled?: boolean
          tax_pence?: number
          tax_rate?: number
          total_pence?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_details?: string | null
          brand_color?: string | null
          business_name?: string | null
          client_email?: string | null
          client_name?: string
          country?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          line_items?: Json
          logo_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_links?: Json
          project_description?: string | null
          sent_at?: string | null
          show_bank_details?: boolean
          show_payment_links?: boolean
          status?: string
          subtotal_pence?: number
          tax_enabled?: boolean
          tax_pence?: number
          tax_rate?: number
          total_pence?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_attachments: {
        Row: {
          country: string
          created_at: string
          id: string
          job_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          job_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          job_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          allow_extra_pros: boolean
          budget_band: string | null
          city: string
          client_display_name: string | null
          close_reason: string | null
          closed_at: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string
          customer_id: string
          details: string
          duration: string | null
          duration_consecutive: boolean | null
          duration_days: number | null
          duration_end_date: string | null
          duration_flexible: boolean | null
          duration_hours: number | null
          duration_start_date: string | null
          event_date: string | null
          event_time: string | null
          event_type: string | null
          expires_at: string
          flexible_dates: boolean
          hired_outside_source: string | null
          hired_professional_id: string | null
          hired_through: string | null
          id: string
          inspiration_links: string[]
          kind: Database["public"]["Enums"]["job_kind"]
          latitude: number | null
          longitude: number | null
          max_responses: number
          postcode_prefix: string | null
          preferred_contact: string | null
          quality_status: string | null
          remote_ok: boolean
          service_id: string | null
          show_name_to_pros: boolean
          status: Database["public"]["Enums"]["job_status"]
          summary: string
          title: string
          unlock_credit_cost: number | null
          updated_at: string
          urgency: string | null
          urgency_status: string
        }
        Insert: {
          allow_extra_pros?: boolean
          budget_band?: string | null
          city: string
          client_display_name?: string | null
          close_reason?: string | null
          closed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          customer_id: string
          details: string
          duration?: string | null
          duration_consecutive?: boolean | null
          duration_days?: number | null
          duration_end_date?: string | null
          duration_flexible?: boolean | null
          duration_hours?: number | null
          duration_start_date?: string | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          expires_at?: string
          flexible_dates?: boolean
          hired_outside_source?: string | null
          hired_professional_id?: string | null
          hired_through?: string | null
          id?: string
          inspiration_links?: string[]
          kind: Database["public"]["Enums"]["job_kind"]
          latitude?: number | null
          longitude?: number | null
          max_responses?: number
          postcode_prefix?: string | null
          preferred_contact?: string | null
          quality_status?: string | null
          remote_ok?: boolean
          service_id?: string | null
          show_name_to_pros?: boolean
          status?: Database["public"]["Enums"]["job_status"]
          summary: string
          title: string
          unlock_credit_cost?: number | null
          updated_at?: string
          urgency?: string | null
          urgency_status?: string
        }
        Update: {
          allow_extra_pros?: boolean
          budget_band?: string | null
          city?: string
          client_display_name?: string | null
          close_reason?: string | null
          closed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          customer_id?: string
          details?: string
          duration?: string | null
          duration_consecutive?: boolean | null
          duration_days?: number | null
          duration_end_date?: string | null
          duration_flexible?: boolean | null
          duration_hours?: number | null
          duration_start_date?: string | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          expires_at?: string
          flexible_dates?: boolean
          hired_outside_source?: string | null
          hired_professional_id?: string | null
          hired_through?: string | null
          id?: string
          inspiration_links?: string[]
          kind?: Database["public"]["Enums"]["job_kind"]
          latitude?: number | null
          longitude?: number | null
          max_responses?: number
          postcode_prefix?: string | null
          preferred_contact?: string | null
          quality_status?: string | null
          remote_ok?: boolean
          service_id?: string | null
          show_name_to_pros?: boolean
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string
          title?: string
          unlock_credit_cost?: number | null
          updated_at?: string
          urgency?: string | null
          urgency_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_hired_professional_id_fkey"
            columns: ["hired_professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "jobs_hired_professional_id_fkey"
            columns: ["hired_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_match_notifications: {
        Row: {
          country: string
          created_at: string
          email_message_id: string | null
          email_sent_at: string | null
          email_status: string
          id: string
          inapp_sent_at: string | null
          job_id: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          email_message_id?: string | null
          email_sent_at?: string | null
          email_status?: string
          id?: string
          inapp_sent_at?: string | null
          job_id: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          email_message_id?: string | null
          email_sent_at?: string | null
          email_status?: string
          id?: string
          inapp_sent_at?: string | null
          job_id?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_match_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_match_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_match_notifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "lead_match_notifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_matches: {
        Row: {
          created_at: string
          id: string
          job_id: string
          professional_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          professional_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_matches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "lead_matches_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_report_events: {
        Row: {
          action: string
          actor_user_id: string | null
          country: string
          created_at: string
          id: string
          metadata: Json
          report_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          country?: string
          created_at?: string
          id?: string
          metadata?: Json
          report_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          country?: string
          created_at?: string
          id?: string
          metadata?: Json
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "lead_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_reports: {
        Row: {
          attempted_call: boolean
          attempted_sms: boolean
          country: string
          created_at: string
          credit_refunded: boolean
          credits_refunded_amount: number | null
          id: string
          job_id: string
          notes: string | null
          professional_id: string
          reason: string
          refund_transaction_id: string | null
          reporter_user_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          twilio_checked_at: string | null
          twilio_details: Json | null
          twilio_status: string | null
          unlock_id: string | null
          updated_at: string
        }
        Insert: {
          attempted_call?: boolean
          attempted_sms?: boolean
          country?: string
          created_at?: string
          credit_refunded?: boolean
          credits_refunded_amount?: number | null
          id?: string
          job_id: string
          notes?: string | null
          professional_id: string
          reason: string
          refund_transaction_id?: string | null
          reporter_user_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          twilio_checked_at?: string | null
          twilio_details?: Json | null
          twilio_status?: string | null
          unlock_id?: string | null
          updated_at?: string
        }
        Update: {
          attempted_call?: boolean
          attempted_sms?: boolean
          country?: string
          created_at?: string
          credit_refunded?: boolean
          credits_refunded_amount?: number | null
          id?: string
          job_id?: string
          notes?: string | null
          professional_id?: string
          reason?: string
          refund_transaction_id?: string | null
          reporter_user_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          twilio_checked_at?: string | null
          twilio_details?: Json | null
          twilio_status?: string | null
          unlock_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reports_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "lead_reports_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reports_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "credit_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reports_unlock_id_fkey"
            columns: ["unlock_id"]
            isOneToOne: false
            referencedRelation: "lead_unlocks"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_unlocks: {
        Row: {
          country: string
          credits_used: number
          id: string
          job_id: string
          professional_id: string
          unlocked_at: string
        }
        Insert: {
          country?: string
          credits_used: number
          id?: string
          job_id: string
          professional_id: string
          unlocked_at?: string
        }
        Update: {
          country?: string
          credits_used?: number
          id?: string
          job_id?: string
          professional_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_unlocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_unlocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_unlocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "lead_unlocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          country: string
          created_at: string
          filename: string
          id: string
          message_id: string
          mime_type: string | null
          quote_request_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          country?: string
          created_at?: string
          filename: string
          id?: string
          message_id: string
          mime_type?: string | null
          quote_request_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          country?: string
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          quote_request_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      message_email_notifications: {
        Row: {
          country: string
          created_at: string
          email_message_id: string | null
          id: string
          message_id: string
          quote_request_id: string
          recipient_role: string
          recipient_user_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          country?: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          message_id: string
          quote_request_id: string
          recipient_role: string
          recipient_user_id: string
          sent_at?: string | null
          status: string
        }
        Update: {
          country?: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          message_id?: string
          quote_request_id?: string
          recipient_role?: string
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_email_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_email_notifications_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          country: string
          created_at: string
          delivered_at: string
          id: string
          quote_request_id: string
          read_at: string | null
          sender_id: string
          source: string
        }
        Insert: {
          body: string
          country?: string
          created_at?: string
          delivered_at?: string
          id?: string
          quote_request_id: string
          read_at?: string | null
          sender_id: string
          source?: string
        }
        Update: {
          body?: string
          country?: string
          created_at?: string
          delivered_at?: string
          id?: string
          quote_request_id?: string
          read_at?: string | null
          sender_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          country: string
          created_at: string
          id: string
          read_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          country?: string
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          country?: string
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      onboarding_videos: {
        Row: {
          created_at: string
          duration_label: string | null
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["onboarding_video_kind"]
          subtitle: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          duration_label?: string | null
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["onboarding_video_kind"]
          subtitle?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          duration_label?: string | null
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["onboarding_video_kind"]
          subtitle?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price_pence: number
          professional_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_pence: number
          professional_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_pence?: number
          professional_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "packages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_countries: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string | null
          currency_symbol: string | null
          domain: string | null
          launch_status: string
          name: string
          payment_provider: string | null
          phone_code: string | null
          status: string
          support_email: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          domain?: string | null
          launch_status?: string
          name: string
          payment_provider?: string | null
          phone_code?: string | null
          status?: string
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          domain?: string | null
          launch_status?: string
          name?: string
          payment_provider?: string | null
          phone_code?: string | null
          status?: string
          support_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      portfolio_items: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          professional_id: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          professional_id: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          professional_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_video_reports: {
        Row: {
          country: string | null
          created_at: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["portfolio_video_report_reason"]
          reporter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["portfolio_video_report_status"]
          video_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["portfolio_video_report_reason"]
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["portfolio_video_report_status"]
          video_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["portfolio_video_report_reason"]
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["portfolio_video_report_status"]
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_video_reports_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "portfolio_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_videos: {
        Row: {
          country: string | null
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          is_active: boolean
          playback_url: string | null
          position: number
          professional_id: string
          provider: string
          provider_asset_id: string | null
          report_count: number
          size_bytes: number | null
          status: Database["public"]["Enums"]["portfolio_video_status"]
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_active?: boolean
          playback_url?: string | null
          position?: number
          professional_id: string
          provider?: string
          provider_asset_id?: string | null
          report_count?: number
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["portfolio_video_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          country?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_active?: boolean
          playback_url?: string | null
          position?: number
          professional_id?: string
          provider?: string
          provider_asset_id?: string | null
          report_count?: number
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["portfolio_video_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_videos_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "portfolio_videos_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_contact_requests: {
        Row: {
          country: string
          created_at: string
          customer_id: string
          id: string
          job_id: string
          professional_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["contact_request_status"]
          unlocked_at: string | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          customer_id: string
          id?: string
          job_id: string
          professional_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["contact_request_status"]
          unlocked_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          customer_id?: string
          id?: string
          job_id?: string
          professional_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["contact_request_status"]
          unlocked_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_contact_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_contact_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_contact_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_contact_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_lead_dismissals: {
        Row: {
          country: string
          created_at: string
          job_id: string
          professional_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          job_id: string
          professional_id: string
        }
        Update: {
          country?: string
          created_at?: string
          job_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_lead_dismissals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_dismissals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_dismissals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_lead_dismissals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_lead_favourites: {
        Row: {
          country: string
          created_at: string
          job_id: string
          professional_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          job_id: string
          professional_id: string
        }
        Update: {
          country?: string
          created_at?: string
          job_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_lead_favourites_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_favourites_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_favourites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_lead_favourites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_lead_views: {
        Row: {
          country: string
          job_id: string
          professional_id: string
          viewed_at: string
        }
        Insert: {
          country?: string
          job_id: string
          professional_id: string
          viewed_at?: string
        }
        Update: {
          country?: string
          job_id?: string
          professional_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_lead_views_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_views_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_lead_views_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_lead_views_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_notification_prefs: {
        Row: {
          created_at: string
          last_digest_sent_at: string | null
          lead_email_mode: Database["public"]["Enums"]["lead_email_mode"]
          lead_inapp_enabled: boolean
          professional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_digest_sent_at?: string | null
          lead_email_mode?: Database["public"]["Enums"]["lead_email_mode"]
          lead_inapp_enabled?: boolean
          professional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_digest_sent_at?: string | null
          lead_email_mode?: Database["public"]["Enums"]["lead_email_mode"]
          lead_inapp_enabled?: boolean
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_notification_prefs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_notification_prefs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_saved_lead_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_saved_lead_views_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "pro_saved_lead_views_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_credits: {
        Row: {
          auto_topup_enabled: boolean
          auto_topup_in_progress: boolean
          auto_topup_in_progress_at: string | null
          auto_topup_last_price_id: string | null
          country: string | null
          credit_balance: number
          free_credits_used: number
          professional_id: string
          referral_bonus_granted: boolean
          referred_by_pro_id: string | null
          stripe_customer_id: string | null
          updated_at: string
          welcome_bonus_granted: boolean
        }
        Insert: {
          auto_topup_enabled?: boolean
          auto_topup_in_progress?: boolean
          auto_topup_in_progress_at?: string | null
          auto_topup_last_price_id?: string | null
          country?: string | null
          credit_balance?: number
          free_credits_used?: number
          professional_id: string
          referral_bonus_granted?: boolean
          referred_by_pro_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          welcome_bonus_granted?: boolean
        }
        Update: {
          auto_topup_enabled?: boolean
          auto_topup_in_progress?: boolean
          auto_topup_in_progress_at?: string | null
          auto_topup_last_price_id?: string | null
          country?: string | null
          credit_balance?: number
          free_credits_used?: number
          professional_id?: string
          referral_bonus_granted?: boolean
          referred_by_pro_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          welcome_bonus_granted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "professional_credits_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_credits_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_credits_referred_by_pro_id_fkey"
            columns: ["referred_by_pro_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_credits_referred_by_pro_id_fkey"
            columns: ["referred_by_pro_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          professional_id: string
          service_id: string
        }
        Insert: {
          professional_id: string
          service_id: string
        }
        Update: {
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          about: string | null
          avatar_kind: string | null
          avatar_path: string | null
          avg_response_minutes: number | null
          brand_color: string | null
          business_name: string
          city: string | null
          contact_name: string | null
          country: string
          cover_image_url: string | null
          cover_storage_path: string | null
          created_at: string
          facebook: string | null
          id: string
          instagram: string | null
          is_verified: boolean
          latitude: number | null
          linkedin: string | null
          logo_storage_path: string | null
          logo_url: string | null
          longitude: number | null
          nationwide_service: boolean
          postcode: string | null
          profile_completeness_pct: number
          rating_avg: number
          rating_count: number
          remote_service: boolean
          response_rate_pct: number | null
          service_area_updated_at: string | null
          service_radius_miles: number
          slug: string
          starting_price_pence: number | null
          status: Database["public"]["Enums"]["pro_status"]
          successful_intros: number
          tiktok: string | null
          twitter: string | null
          updated_at: string
          user_id: string
          website: string | null
          years_experience: number | null
          youtube: string | null
        }
        Insert: {
          about?: string | null
          avatar_kind?: string | null
          avatar_path?: string | null
          avg_response_minutes?: number | null
          brand_color?: string | null
          business_name: string
          city?: string | null
          contact_name?: string | null
          country?: string
          cover_image_url?: string | null
          cover_storage_path?: string | null
          created_at?: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_verified?: boolean
          latitude?: number | null
          linkedin?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
          longitude?: number | null
          nationwide_service?: boolean
          postcode?: string | null
          profile_completeness_pct?: number
          rating_avg?: number
          rating_count?: number
          remote_service?: boolean
          response_rate_pct?: number | null
          service_area_updated_at?: string | null
          service_radius_miles?: number
          slug: string
          starting_price_pence?: number | null
          status?: Database["public"]["Enums"]["pro_status"]
          successful_intros?: number
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          years_experience?: number | null
          youtube?: string | null
        }
        Update: {
          about?: string | null
          avatar_kind?: string | null
          avatar_path?: string | null
          avg_response_minutes?: number | null
          brand_color?: string | null
          business_name?: string
          city?: string | null
          contact_name?: string | null
          country?: string
          cover_image_url?: string | null
          cover_storage_path?: string | null
          created_at?: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_verified?: boolean
          latitude?: number | null
          linkedin?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
          longitude?: number | null
          nationwide_service?: boolean
          postcode?: string | null
          profile_completeness_pct?: number
          rating_avg?: number
          rating_count?: number
          remote_service?: boolean
          response_rate_pct?: number | null
          service_area_updated_at?: string | null
          service_radius_miles?: number
          slug?: string
          starting_price_pence?: number | null
          status?: Database["public"]["Enums"]["pro_status"]
          successful_intros?: number
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          years_experience?: number | null
          youtube?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["app_role"] | null
          avatar_url: string | null
          country: string
          created_at: string
          frequent_user: boolean
          full_name: string | null
          id: string
          phone: string | null
          phone_verified_at: string | null
          sound_new_message: boolean
          updated_at: string
          verified: boolean
          verified_phone: boolean
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["app_role"] | null
          avatar_url?: string | null
          country?: string
          created_at?: string
          frequent_user?: boolean
          full_name?: string | null
          id: string
          phone?: string | null
          phone_verified_at?: string | null
          sound_new_message?: boolean
          updated_at?: string
          verified?: boolean
          verified_phone?: boolean
        }
        Update: {
          account_type?: Database["public"]["Enums"]["app_role"] | null
          avatar_url?: string | null
          country?: string
          created_at?: string
          frequent_user?: boolean
          full_name?: string | null
          id?: string
          phone?: string | null
          phone_verified_at?: string | null
          sound_new_message?: boolean
          updated_at?: string
          verified?: boolean
          verified_phone?: boolean
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          applies_to_role: string | null
          applies_to_user_id: string | null
          code: string
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          max_uses: number | null
          updated_at: string
          uses: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          applies_to_role?: string | null
          applies_to_user_id?: string | null
          code: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          max_uses?: number | null
          updated_at?: string
          uses?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          applies_to_role?: string | null
          applies_to_user_id?: string | null
          code?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          max_uses?: number | null
          updated_at?: string
          uses?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          id: string
          metadata: Json
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          metadata?: Json
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          metadata?: Json
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          archived_by_pro: boolean
          budget_band: string | null
          client_status: string
          closed: boolean
          country: string
          created_at: string
          customer_id: string
          deleted_by_customer: boolean
          deleted_by_pro: boolean
          details: string
          event_date: string | null
          hired: boolean
          id: string
          job_id: string | null
          last_message_at: string | null
          location: string | null
          professional_id: string
          quoted_price_pence: number | null
          reply_token: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          archived_by_pro?: boolean
          budget_band?: string | null
          client_status?: string
          closed?: boolean
          country?: string
          created_at?: string
          customer_id: string
          deleted_by_customer?: boolean
          deleted_by_pro?: boolean
          details: string
          event_date?: string | null
          hired?: boolean
          id?: string
          job_id?: string | null
          last_message_at?: string | null
          location?: string | null
          professional_id: string
          quoted_price_pence?: number | null
          reply_token?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          archived_by_pro?: boolean
          budget_band?: string | null
          client_status?: string
          closed?: boolean
          country?: string
          created_at?: string
          customer_id?: string
          deleted_by_customer?: boolean
          deleted_by_pro?: boolean
          details?: string
          event_date?: string | null
          hired?: boolean
          id?: string
          job_id?: string | null
          last_message_at?: string | null
          location?: string | null
          professional_id?: string
          quoted_price_pence?: number | null
          reply_token?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "quote_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: string
          max_uses: number | null
          owner_user_id: string | null
          reward_for_referee: number
          reward_for_referrer: number
          updated_at: string
          uses: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind?: string
          max_uses?: number | null
          owner_user_id?: string | null
          reward_for_referee?: number
          reward_for_referrer?: number
          updated_at?: string
          uses?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: string
          max_uses?: number | null
          owner_user_id?: string | null
          reward_for_referee?: number
          reward_for_referrer?: number
          updated_at?: string
          uses?: number
        }
        Relationships: []
      }
      review_replies: {
        Row: {
          body: string
          country: string
          created_at: string
          id: string
          professional_id: string
          review_id: string
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          country?: string
          created_at?: string
          id?: string
          professional_id: string
          review_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          country?: string
          created_at?: string
          id?: string
          professional_id?: string
          review_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "review_replies_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          country: string
          created_at: string
          id: string
          reason: string | null
          reporter_id: string
          resolved_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id: string
          resolved_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string
          resolved_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          body: string | null
          country: string
          created_at: string
          customer_id: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          job_id: string | null
          photos: string[]
          professional_id: string
          project_category: string | null
          quote_request_id: string
          rating: number
          status: string
          title: string | null
          updated_at: string
          would_recommend: boolean
        }
        Insert: {
          body?: string | null
          country?: string
          created_at?: string
          customer_id: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          job_id?: string | null
          photos?: string[]
          professional_id: string
          project_category?: string | null
          quote_request_id: string
          rating: number
          status?: string
          title?: string | null
          updated_at?: string
          would_recommend?: boolean
        }
        Update: {
          body?: string | null
          country?: string
          created_at?: string
          customer_id?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          job_id?: string | null
          photos?: string[]
          professional_id?: string
          project_category?: string | null
          quote_request_id?: string
          rating?: number
          status?: string
          title?: string | null
          updated_at?: string
          would_recommend?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: true
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["service_kind"]
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["service_kind"]
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      staff_accounts: {
        Row: {
          activated_at: string | null
          country: string | null
          created_at: string
          invited_at: string | null
          invited_by: string | null
          last_login_at: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          country?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          country?: string | null
          created_at?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_invites: {
        Row: {
          consumed_at: string | null
          consumed_by: string | null
          country: string | null
          created_at: string
          email: string
          email_attempts: number
          email_last_error: string | null
          email_sent_at: string | null
          email_status: string
          expires_at: string
          id: string
          invited_by: string | null
          permission_overrides: Json
          role: Database["public"]["Enums"]["staff_role"]
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by?: string | null
          country?: string | null
          created_at?: string
          email: string
          email_attempts?: number
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permission_overrides?: Json
          role: Database["public"]["Enums"]["staff_role"]
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by?: string | null
          country?: string | null
          created_at?: string
          email?: string
          email_attempts?: number
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permission_overrides?: Json
          role?: Database["public"]["Enums"]["staff_role"]
          token_hash?: string
        }
        Relationships: []
      }
      staff_permission_overrides: {
        Row: {
          created_at: string
          effect: string
          permission: Database["public"]["Enums"]["staff_permission"]
          user_id: string
        }
        Insert: {
          created_at?: string
          effect: string
          permission: Database["public"]["Enums"]["staff_permission"]
          user_id: string
        }
        Update: {
          created_at?: string
          effect?: string
          permission?: Database["public"]["Enums"]["staff_permission"]
          user_id?: string
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          admin_viewed_at: string | null
          admin_viewed_by: string | null
          ai_classified_at: string | null
          ai_keywords: string[] | null
          ai_priority: Database["public"]["Enums"]["support_priority"] | null
          ai_priority_confidence: number | null
          ai_reasoning: string | null
          ai_sentiment: Database["public"]["Enums"]["support_sentiment"] | null
          ai_sentiment_confidence: number | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          attachment_paths: string[]
          category: string | null
          country: string
          created_at: string
          email: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          message: string
          name: string | null
          priority: Database["public"]["Enums"]["support_priority"]
          priority_overridden: boolean
          priority_overridden_at: string | null
          priority_overridden_by: string | null
          resolution_due_at: string | null
          resolved_at: string | null
          role: string | null
          sla_breach_notified_at: string | null
          sla_due_soon_notified_at: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_viewed_at?: string | null
          admin_viewed_by?: string | null
          ai_classified_at?: string | null
          ai_keywords?: string[] | null
          ai_priority?: Database["public"]["Enums"]["support_priority"] | null
          ai_priority_confidence?: number | null
          ai_reasoning?: string | null
          ai_sentiment?: Database["public"]["Enums"]["support_sentiment"] | null
          ai_sentiment_confidence?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          attachment_paths?: string[]
          category?: string | null
          country?: string
          created_at?: string
          email?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          message: string
          name?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          priority_overridden?: boolean
          priority_overridden_at?: string | null
          priority_overridden_by?: string | null
          resolution_due_at?: string | null
          resolved_at?: string | null
          role?: string | null
          sla_breach_notified_at?: string | null
          sla_due_soon_notified_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_viewed_at?: string | null
          admin_viewed_by?: string | null
          ai_classified_at?: string | null
          ai_keywords?: string[] | null
          ai_priority?: Database["public"]["Enums"]["support_priority"] | null
          ai_priority_confidence?: number | null
          ai_reasoning?: string | null
          ai_sentiment?: Database["public"]["Enums"]["support_sentiment"] | null
          ai_sentiment_confidence?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          attachment_paths?: string[]
          category?: string | null
          country?: string
          created_at?: string
          email?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          message?: string
          name?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          priority_overridden?: boolean
          priority_overridden_at?: string | null
          priority_overridden_by?: string | null
          resolution_due_at?: string | null
          resolved_at?: string | null
          role?: string | null
          sla_breach_notified_at?: string | null
          sla_due_soon_notified_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          action_description: string | null
          action_type: string
          actor_user_id: string | null
          country: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_description?: string | null
          action_type: string
          actor_user_id?: string | null
          country?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_description?: string | null
          action_type?: string
          actor_user_id?: string | null
          country?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_risk_scores: {
        Row: {
          computed_at: string
          country: string
          level: string
          previous_score: number | null
          reasons: Json
          score: number
          signals: Json
          trend: string
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          country?: string
          level?: string
          previous_score?: number | null
          reasons?: Json
          score?: number
          signals?: Json
          trend?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_at?: string
          country?: string
          level?: string
          previous_score?: number | null
          reasons?: Json
          score?: number
          signals?: Json
          trend?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tags: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          reason: string | null
          source: Database["public"]["Enums"]["user_tag_source"]
          tag: Database["public"]["Enums"]["app_user_tag"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["user_tag_source"]
          tag: Database["public"]["Enums"]["app_user_tag"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["user_tag_source"]
          tag?: Database["public"]["Enums"]["app_user_tag"]
          user_id?: string
        }
        Relationships: []
      }
      vip_rewards: {
        Row: {
          coins: number | null
          granted_at: string
          granted_by: string | null
          id: string
          note: string | null
          promo_code: string | null
          reward_type: string
          user_id: string
        }
        Insert: {
          coins?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          promo_code?: string | null
          reward_type: string
          user_id: string
        }
        Update: {
          coins?: number | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          promo_code?: string | null
          reward_type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      jobs_public: {
        Row: {
          budget_band: string | null
          city: string | null
          created_at: string | null
          event_date: string | null
          id: string | null
          kind: Database["public"]["Enums"]["job_kind"] | null
          service_id: string | null
          status: Database["public"]["Enums"]["job_status"] | null
          summary: string | null
          title: string | null
        }
        Insert: {
          budget_band?: string | null
          city?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["job_kind"] | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          summary?: string | null
          title?: string | null
        }
        Update: {
          budget_band?: string | null
          city?: string | null
          created_at?: string | null
          event_date?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["job_kind"] | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
          summary?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notification_debug: {
        Row: {
          created_at: string | null
          delivery_error: string | null
          delivery_status: string | null
          email_message_id: string | null
          inapp_sent_at: string | null
          job_city: string | null
          job_id: string | null
          job_title: string | null
          notification_id: string | null
          notification_status: string | null
          notification_type: string | null
          pref_inapp: boolean | null
          pref_mode: Database["public"]["Enums"]["lead_email_mode"] | null
          pro_business_name: string | null
          pro_email: string | null
          pro_id: string | null
          sent_at: string | null
          service_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_match_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_match_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_match_notifications_professional_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "professional_video_eligibility"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "lead_match_notifications_professional_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      message_email_debug: {
        Row: {
          created_at: string | null
          delivery_error: string | null
          delivery_status: string | null
          job_title: string | null
          message_body: string | null
          message_id: string | null
          notification_id: string | null
          quote_request_id: string | null
          recipient_role: string | null
          recipient_user_id: string | null
          sender_id: string | null
          sent_at: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_email_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_email_notifications_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_video_eligibility: {
        Row: {
          is_eligible: boolean | null
          professional_id: string | null
        }
        Insert: {
          is_eligible?: never
          professional_id?: string | null
        }
        Update: {
          is_eligible?: never
          professional_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _refund_lead_report: {
        Args: { _actor: string; _note: string; _report_id: string }
        Returns: undefined
      }
      add_portfolio_item: {
        Args: { _caption?: string; _image_url: string }
        Returns: string
      }
      admin_get_lead_dispute_debug: {
        Args: { _report_id: string }
        Returns: {
          current_dispute_status: string
          current_outcome: string
          email_queue_message_id: string
          email_queue_pgmq_msg_id: number
          email_queue_read_count: number
          email_queue_status: string
          last_email_error: string
          last_updated_timestamp: string
          notification_created: boolean
          notification_id: string
          notification_user_id: string
          professional_email: string
          professional_id: string
          professional_user_id: string
          report_id: string
        }[]
      }
      admin_get_lead_reports: {
        Args: { _job_id: string }
        Returns: {
          attempted_call: boolean
          attempted_sms: boolean
          business_name: string
          created_at: string
          credits_refunded_amount: number
          id: string
          notes: string
          professional_id: string
          reason: string
          resolution_note: string
          resolved_at: string
          status: string
        }[]
      }
      admin_launch_cleanup_preview: { Args: { _mode: string }; Returns: Json }
      admin_launch_cleanup_run: { Args: { _mode: string }; Returns: Json }
      admin_list_lead_reports: {
        Args: { _status?: string }
        Returns: {
          customer_name: string
          first_report_at: string
          job_id: string
          job_title: string
          last_report_at: string
          pending_count: number
          quality_status: string
          report_count: number
        }[]
      }
      admin_moderate_review: {
        Args: { _action: string; _reason?: string; _review_id: string }
        Returns: undefined
      }
      admin_remove_user_tag: {
        Args: {
          _tag: Database["public"]["Enums"]["app_user_tag"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_resolve_lead_report: {
        Args: { _decision: string; _note: string; _report_id: string }
        Returns: undefined
      }
      admin_set_cron_hooks_secret: {
        Args: { _secret: string }
        Returns: undefined
      }
      admin_set_phone_verified: {
        Args: { _reason: string; _user_id: string; _verified: boolean }
        Returns: undefined
      }
      admin_set_user_tag: {
        Args: {
          _reason: string
          _tag: Database["public"]["Enums"]["app_user_tag"]
          _user_id: string
        }
        Returns: undefined
      }
      assert_country_access: { Args: { _country: string }; Returns: undefined }
      browse_marketplace_leads: {
        Args: never
        Returns: {
          allow_extra_pros: boolean
          budget_band: string
          city: string
          client_display_name: string
          created_at: string
          customer_account_age_days: number
          customer_first_name: string
          customer_frequent_user: boolean
          customer_member_since: string
          customer_previous_requests: number
          customer_verified: boolean
          customer_verified_phone: boolean
          details: string
          distance_miles: number
          duration: string
          duration_days: number
          duration_hours: number
          event_date: string
          event_time: string
          event_type: string
          expires_at: string
          flexible_dates: boolean
          id: string
          inspiration_links: string[]
          kind: string
          latitude: number
          longitude: number
          masked_contact_email: string
          masked_contact_phone: string
          max_responses: number
          postcode_prefix: string
          priority_radius_miles: number
          response_count: number
          service_name: string
          status: string
          summary: string
          title: string
          unlock_credit_cost: number
          unlocked: boolean
          urgency: string
          urgency_status: string
        }[]
      }
      calculate_lead_credits: {
        Args: { _budget_band?: string; _hours: number }
        Returns: number
      }
      can_review_pro: {
        Args: { _job_id: string; _pro_id: string }
        Returns: {
          eligible: boolean
          quote_request_id: string
          reason: string
        }[]
      }
      close_job_with_outcome: {
        Args: {
          _hired_pro_id?: string
          _hired_through?: string
          _job_id: string
          _outside_source?: string
          _reason: string
        }
        Returns: {
          hired_qr_id: string
          job_id: string
        }[]
      }
      compute_profile_completeness: {
        Args: { _pro: Database["public"]["Tables"]["professionals"]["Row"] }
        Returns: number
      }
      compute_user_verified: { Args: { _u: unknown }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_thread_for_me: { Args: { _qr_id: string }; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_my_job: { Args: { _job_id: string }; Returns: Json }
      get_my_professional: {
        Args: never
        Returns: {
          about: string
          avatar_kind: string
          avatar_path: string
          business_name: string
          city: string
          contact_name: string
          country: string
          cover_image_url: string
          facebook: string
          id: string
          instagram: string
          is_verified: boolean
          latitude: number
          logo_url: string
          longitude: number
          nationwide_service: boolean
          postcode: string
          rating_avg: number
          rating_count: number
          remote_service: boolean
          service_area_updated_at: string
          service_radius_miles: number
          slug: string
          starting_price_pence: number
          status: Database["public"]["Enums"]["pro_status"]
          tiktok: string
          website: string
          years_experience: number
        }[]
      }
      get_pro_contact_info: {
        Args: { _pro_id: string }
        Returns: {
          facebook: string
          instagram: string
          linkedin: string
          tiktok: string
          twitter: string
          website: string
          youtube: string
        }[]
      }
      get_pro_review_stats: {
        Args: { _pro_id: string }
        Returns: {
          avg_rating: number
          c1: number
          c2: number
          c3: number
          c4: number
          c5: number
          recommend_pct: number
          total: number
        }[]
      }
      get_pro_reviews: {
        Args: { _pro_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          project_category: string
          rating: number
          reply_avatar_path: string
          reply_body: string
          reply_business_name: string
          reply_created_at: string
          reviewer_first_name: string
          reviewer_verified: boolean
          title: string
          would_recommend: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_permission: {
        Args: {
          _perm: Database["public"]["Enums"]["staff_permission"]
          _uid: string
        }
        Returns: boolean
      }
      is_email_banned: { Args: { _email: string }; Returns: boolean }
      is_staff: { Args: { _uid: string }; Returns: boolean }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      is_thread_participant: { Args: { _qr: string }; Returns: boolean }
      list_public_portfolio_videos: {
        Args: { _pro_id: string }
        Returns: {
          duration_seconds: number
          ordinal: number
          playback_url: string
          thumbnail_url: string
          title: string
          video_id: string
        }[]
      }
      log_admin_action: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _metadata: Json
        }
        Returns: string
      }
      log_user_activity: {
        Args: {
          _action_description: string
          _action_type: string
          _entity_id?: string
          _entity_type?: string
          _ip?: string
          _metadata?: Json
          _user_agent?: string
          _user_id: string
        }
        Returns: string
      }
      mark_contact_request_viewed: {
        Args: { _job_id: string }
        Returns: undefined
      }
      mark_thread_read: { Args: { _qr_id: string }; Returns: undefined }
      mask_email: { Args: { _email: string }; Returns: string }
      mask_phone: { Args: { _phone: string }; Returns: string }
      miles_between: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_client_contact_requests: {
        Args: never
        Returns: {
          budget_band: string
          city: string
          created_at: string
          event_date: string
          id: string
          job_id: string
          responded_at: string
          service_name: string
          status: string
          title: string
          unlocked: boolean
          unlocked_at: string
          viewed_at: string
        }[]
      }
      my_invited_pros: {
        Args: { _job_id: string }
        Returns: {
          avatar_path: string
          business_name: string
          city: string
          created_at: string
          id: string
          is_verified: boolean
          professional_id: string
          responded_at: string
          slug: string
          status: string
          unlocked_at: string
          viewed_at: string
        }[]
      }
      my_job_outcome_stats: {
        Args: never
        Returns: {
          conversion_pct: number
          hires_outside: number
          hires_shootbase: number
          total_closed: number
          total_posted: number
        }[]
      }
      my_lead_reports: {
        Args: never
        Returns: {
          created_at: string
          credit_refunded: boolean
          credits_refunded_amount: number
          id: string
          job_id: string
          job_title: string
          reason: string
          resolved_at: string
          status: string
        }[]
      }
      my_matching_leads: {
        Args: never
        Returns: {
          budget_band: string
          city: string
          created_at: string
          email_status: string
          event_date: string
          job_id: string
          notification_id: string
          service_name: string
          summary: string
          title: string
          unlocked: boolean
          urgency: string
        }[]
      }
      my_portfolio: {
        Args: never
        Returns: {
          caption: string
          created_at: string
          display_order: number
          has_subscription: boolean
          id: string
          image_url: string
          max_items: number
          total: number
        }[]
      }
      my_pro_threads: {
        Args: never
        Returns: {
          archived_by_pro: boolean
          budget_band: string
          city: string
          client_display_name: string
          client_status: string
          closed: boolean
          customer_email: string
          customer_id: string
          customer_name: string
          customer_phone: string
          details: string
          event_date: string
          event_time: string
          hired: boolean
          job_id: string
          last_message_at: string
          last_message_body: string
          last_message_sender: string
          last_message_source: string
          qr_id: string
          status: string
          title: string
          unread_count: number
        }[]
      }
      my_unlocked_leads: {
        Args: never
        Returns: {
          budget_band: string
          city: string
          credits_used: number
          customer_email: string
          customer_name: string
          customer_phone: string
          customer_verified_phone: boolean
          details: string
          event_date: string
          event_time: string
          job_id: string
          title: string
          unlock_id: string
          unlocked_at: string
        }[]
      }
      portfolio_limit_for: { Args: { _pro_id: string }; Returns: number }
      pro_candidates_for_job: {
        Args: { _job_id: string }
        Returns: {
          avatar_path: string
          business_name: string
          city: string
          professional_id: string
          qr_id: string
          slug: string
          source: string
        }[]
      }
      pro_covers_job: {
        Args: {
          _job_lat: number
          _job_lng: number
          _job_remote_ok: boolean
          _pro_lat: number
          _pro_lng: number
          _pro_nationwide: boolean
          _pro_radius_miles: number
          _pro_remote: boolean
        }
        Returns: boolean
      }
      pro_has_active_subscription: {
        Args: { _pro_id: string }
        Returns: boolean
      }
      pro_lead_visibility_debug: {
        Args: never
        Returns: {
          explicit_match: boolean
          in_area: boolean
          job_city: string
          job_id: string
          offers_service: boolean
          pro_active: boolean
          pro_city: string
          reason: string
          title: string
          visible: boolean
        }[]
      }
      professional_has_video_services: {
        Args: { _pro_id: string }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_all_user_tags: { Args: never; Returns: number }
      recompute_user_tags: { Args: { _user_id: string }; Returns: undefined }
      reorder_portfolio: {
        Args: { _ordered_ids: string[] }
        Returns: undefined
      }
      reply_to_review: {
        Args: { _body: string; _review_id: string }
        Returns: string
      }
      report_review_target: {
        Args: { _reason: string; _target_id: string; _target_type: string }
        Returns: string
      }
      request_client_phone_otp: {
        Args: { _phone: string }
        Returns: {
          dev_code: string
          expires_at: string
          otp_id: string
        }[]
      }
      request_pro_contact: {
        Args: { _job_id: string; _professional_id: string }
        Returns: {
          created_at: string
          id: string
          status: string
          was_new: boolean
        }[]
      }
      same_country: { Args: { _a: string; _b: string }; Returns: boolean }
      sla_resolution_hours: {
        Args: { _priority: Database["public"]["Enums"]["support_priority"] }
        Returns: number
      }
      sla_response_hours: {
        Args: { _priority: Database["public"]["Enums"]["support_priority"] }
        Returns: number
      }
      staff_can_see_country: {
        Args: { _country: string; _uid: string }
        Returns: boolean
      }
      staff_country: { Args: { _uid: string }; Returns: string }
      staff_country_of: { Args: { _uid: string }; Returns: string }
      staff_role_default_permissions: {
        Args: { _role: Database["public"]["Enums"]["staff_role"] }
        Returns: Database["public"]["Enums"]["staff_permission"][]
      }
      staff_role_of: {
        Args: { _uid: string }
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      submit_lead_report: {
        Args: {
          _attempted_call: boolean
          _attempted_sms: boolean
          _job_id: string
          _notes: string
          _reason: string
        }
        Returns: string
      }
      submit_pro_review: {
        Args: {
          _body: string
          _job_id: string
          _pro_id: string
          _project_category: string
          _rating: number
          _title: string
          _would_recommend: boolean
        }
        Returns: string
      }
      suggest_pros_for_job: {
        Args: { _job_id: string }
        Returns: {
          about: string
          already_invited: boolean
          avatar_path: string
          avg_response_minutes: number
          business_name: string
          city: string
          distance_miles: number
          is_verified: boolean
          professional_id: string
          profile_completeness_pct: number
          rating_avg: number
          rating_count: number
          response_rate_pct: number
          service_name: string
          slug: string
          successful_intros: number
        }[]
      }
      unlock_job: {
        Args: { _job_id: string }
        Returns: {
          budget_band: string
          city: string
          credits_used: number
          customer_email: string
          customer_name: string
          customer_phone: string
          customer_verified_phone: boolean
          details: string
          event_date: string
          event_time: string
          job_id: string
          quote_request_id: string
          title: string
        }[]
      }
      user_country: { Args: { _uid: string }; Returns: string }
      verify_client_phone_otp: {
        Args: { _code: string }
        Returns: {
          phone: string
          verified: boolean
        }[]
      }
    }
    Enums: {
      app_role: "customer" | "professional" | "admin"
      app_user_tag: "vip" | "high_spender" | "risky" | "inactive"
      contact_request_status: "pending" | "viewed" | "unlocked" | "responded"
      credit_tx_type:
        | "welcome_bonus"
        | "credit_purchase"
        | "lead_unlock"
        | "refund"
        | "admin_adjustment"
        | "subscription_grant"
        | "auto_topup"
      job_kind: "photography" | "videography"
      job_status: "open" | "closed" | "expired" | "paused"
      lead_email_mode: "instant" | "daily" | "weekly" | "off"
      onboarding_video_kind: "youtube" | "vimeo" | "mp4" | "url"
      portfolio_video_report_reason:
        | "inappropriate"
        | "copyright"
        | "spam"
        | "wrong_category"
        | "other"
      portfolio_video_report_status: "open" | "dismissed" | "actioned"
      portfolio_video_status:
        | "uploading"
        | "processing"
        | "ready"
        | "failed"
        | "inactive"
      pro_status: "draft" | "pending_review" | "active" | "suspended"
      quote_status:
        | "pending"
        | "quoted"
        | "accepted"
        | "declined"
        | "completed"
        | "cancelled"
      service_kind: "photography" | "videography"
      staff_permission:
        | "users.view"
        | "users.edit"
        | "users.suspend"
        | "users.delete"
        | "tickets.view"
        | "tickets.reply"
        | "tickets.manage"
        | "coins.view"
        | "coins.adjust"
        | "coins.refund"
        | "leads.manage"
        | "verification.manage"
        | "staff.manage"
        | "settings.manage"
        | "audit.view"
        | "analytics.view"
        | "notifications.view"
        | "coins.bank_transfers"
      staff_role:
        | "super_admin"
        | "admin"
        | "support_agent"
        | "moderator"
        | "finance_manager"
        | "team_member"
        | "country_admin"
      support_priority: "low" | "medium" | "high" | "urgent"
      support_sentiment: "positive" | "neutral" | "frustrated" | "angry"
      user_tag_source: "auto" | "manual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "professional", "admin"],
      app_user_tag: ["vip", "high_spender", "risky", "inactive"],
      contact_request_status: ["pending", "viewed", "unlocked", "responded"],
      credit_tx_type: [
        "welcome_bonus",
        "credit_purchase",
        "lead_unlock",
        "refund",
        "admin_adjustment",
        "subscription_grant",
        "auto_topup",
      ],
      job_kind: ["photography", "videography"],
      job_status: ["open", "closed", "expired", "paused"],
      lead_email_mode: ["instant", "daily", "weekly", "off"],
      onboarding_video_kind: ["youtube", "vimeo", "mp4", "url"],
      portfolio_video_report_reason: [
        "inappropriate",
        "copyright",
        "spam",
        "wrong_category",
        "other",
      ],
      portfolio_video_report_status: ["open", "dismissed", "actioned"],
      portfolio_video_status: [
        "uploading",
        "processing",
        "ready",
        "failed",
        "inactive",
      ],
      pro_status: ["draft", "pending_review", "active", "suspended"],
      quote_status: [
        "pending",
        "quoted",
        "accepted",
        "declined",
        "completed",
        "cancelled",
      ],
      service_kind: ["photography", "videography"],
      staff_permission: [
        "users.view",
        "users.edit",
        "users.suspend",
        "users.delete",
        "tickets.view",
        "tickets.reply",
        "tickets.manage",
        "coins.view",
        "coins.adjust",
        "coins.refund",
        "leads.manage",
        "verification.manage",
        "staff.manage",
        "settings.manage",
        "audit.view",
        "analytics.view",
        "notifications.view",
        "coins.bank_transfers",
      ],
      staff_role: [
        "super_admin",
        "admin",
        "support_agent",
        "moderator",
        "finance_manager",
        "team_member",
        "country_admin",
      ],
      support_priority: ["low", "medium", "high", "urgent"],
      support_sentiment: ["positive", "neutral", "frustrated", "angry"],
      user_tag_source: ["auto", "manual"],
    },
  },
} as const
