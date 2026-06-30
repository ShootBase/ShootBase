-- PART 1: Drop leftover types/tables, recreate core schema
DROP TABLE IF EXISTS public.saved_jobs CASCADE;
DROP TABLE IF EXISTS public.applications CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.job_ads CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP FUNCTION IF EXISTS public.tg_notify_client_on_application() CASCADE;
DROP FUNCTION IF EXISTS public.tg_notify_pros_on_new_job() CASCADE;
DROP FUNCTION IF EXISTS public.tg_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.service_kind CASCADE;
DROP TYPE IF EXISTS public.quote_status CASCADE;
DROP TYPE IF EXISTS public.pro_status CASCADE;
DROP TYPE IF EXISTS public.credit_tx_type CASCADE;
DROP TYPE IF EXISTS public.job_status CASCADE;
DROP TYPE IF EXISTS public.job_kind CASCADE;
DROP TYPE IF EXISTS public.onboarding_video_kind CASCADE;

CREATE TYPE public.app_role AS ENUM ('customer', 'professional', 'admin');
CREATE TYPE public.service_kind AS ENUM ('photography', 'videography');
CREATE TYPE public.quote_status AS ENUM ('pending', 'quoted', 'accepted', 'declined', 'completed', 'cancelled');
CREATE TYPE public.pro_status AS ENUM ('draft', 'pending_review', 'active', 'suspended');
CREATE TYPE public.credit_tx_type AS ENUM ('welcome_bonus','credit_purchase','lead_unlock','refund','admin_adjustment','subscription_grant','auto_topup');
CREATE TYPE public.job_status AS ENUM ('open','closed','expired');
CREATE TYPE public.job_kind AS ENUM ('photography','videography');
CREATE TYPE public.onboarding_video_kind AS ENUM ('youtube', 'vimeo', 'mp4', 'url');

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, phone TEXT, avatar_url TEXT,
  account_type public.app_role,
  verified_phone boolean NOT NULL DEFAULT false,
  frequent_user boolean NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER tg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$fn$;

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  kind public.service_kind NOT NULL, sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services public read" ON public.services FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.services (slug, name, kind, sort_order) VALUES
  ('wedding-photography','Wedding Photography','photography',1),
  ('corporate-photography','Corporate Photography','photography',2),
  ('event-photography','Event Photography','photography',3),
  ('real-estate-photography','Real Estate Photography','photography',4),
  ('lifestyle-photography','Lifestyle Photography','photography',5),
  ('wedding-videography','Wedding Videography','videography',6),
  ('corporate-video','Corporate Video Production','videography',7),
  ('event-videography','Event Videography','videography',8),
  ('real-estate-video','Real Estate Video Tours','videography',9),
  ('lifestyle-brand-content','Lifestyle and Brand Content','videography',10);

CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE, business_name TEXT NOT NULL,
  contact_name TEXT, about TEXT, city TEXT, postcode TEXT,
  country TEXT NOT NULL DEFAULT 'United Kingdom',
  years_experience INT, cover_image_url TEXT, logo_url TEXT,
  website TEXT, instagram TEXT, facebook TEXT, tiktok TEXT,
  starting_price_pence INT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  status public.pro_status NOT NULL DEFAULT 'draft',
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  avatar_path text, avatar_kind text CHECK (avatar_kind IS NULL OR avatar_kind IN ('logo','photo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX professionals_status_idx ON public.professionals(status);
CREATE INDEX professionals_city_idx ON public.professionals(city);
GRANT SELECT (id, slug, business_name, about, city, country, years_experience, cover_image_url, logo_url, website, instagram, facebook, tiktok, starting_price_pence, is_verified, status, rating_avg, rating_count, avatar_path, avatar_kind, created_at) ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pros public read active" ON public.professionals FOR SELECT TO anon, authenticated USING (status = 'active' OR user_id = auth.uid());
CREATE POLICY "pros owner insert" ON public.professionals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pros owner update" ON public.professionals FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER tg_pros_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.professional_services (
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);
GRANT SELECT ON public.professional_services TO anon, authenticated;
GRANT INSERT, DELETE ON public.professional_services TO authenticated;
GRANT ALL ON public.professional_services TO service_role;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps public read" ON public.professional_services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "ps owner write" ON public.professional_services FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "ps owner delete" ON public.professional_services FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE TABLE public.portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL, caption TEXT, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_pro_idx ON public.portfolio_items(professional_id);
GRANT SELECT ON public.portfolio_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolio_items TO service_role;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio public read" ON public.portfolio_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "portfolio owner write" ON public.portfolio_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "portfolio owner update" ON public.portfolio_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "portfolio owner delete" ON public.portfolio_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, price_pence INT NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX packages_pro_idx ON public.packages(professional_id);
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages public read" ON public.packages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "packages owner insert" ON public.packages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "packages owner update" ON public.packages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "packages owner delete" ON public.packages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));