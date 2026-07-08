export type AppRole = 'customer' | 'professional' | 'admin';

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  account_type: AppRole | null;
  country: string;
  created_at: string;
  updated_at: string;
  verified_phone: boolean;
  phone_verified_at: string | null;
  pending_phone_number: string | null;
};

export type ProfileUpdate = {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  account_type?: AppRole | null;
  country?: string;
  verified_phone?: boolean;
  phone_verified_at?: string | null;
  pending_phone_number?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileUpdate & { id: string };
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
