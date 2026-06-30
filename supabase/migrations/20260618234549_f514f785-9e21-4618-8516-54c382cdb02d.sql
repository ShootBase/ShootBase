
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('customer', 'professional', 'admin');
CREATE TYPE public.service_kind AS ENUM ('photography', 'videography');
CREATE TYPE public.quote_status AS ENUM ('pending', 'quoted', 'accepted', 'declined', 'completed', 'cancelled');
CREATE TYPE public.pro_status AS ENUM ('draft', 'pending_review', 'active', 'suspended');

-- ============ UTIL: updated_at ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  account_type public.app_role,
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

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER ROLES ============
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
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Server function will use service_role to assign role on account-type selection.

-- ============ SERVICES (lookup) ============
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind public.service_kind NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
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

-- ============ PROFESSIONALS ============
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  about TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT NOT NULL DEFAULT 'United Kingdom',
  years_experience INT,
  cover_image_url TEXT,
  logo_url TEXT,
  website TEXT,
  instagram TEXT,
  facebook TEXT,
  tiktok TEXT,
  starting_price_pence INT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  status public.pro_status NOT NULL DEFAULT 'draft',
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX professionals_status_idx ON public.professionals(status);
CREATE INDEX professionals_city_idx ON public.professionals(city);
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pros public read active" ON public.professionals FOR SELECT TO anon, authenticated USING (status = 'active' OR user_id = auth.uid());
CREATE POLICY "pros owner insert" ON public.professionals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pros owner update" ON public.professionals FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER tg_pros_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PROFESSIONAL_SERVICES (join) ============
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
CREATE POLICY "ps owner write" ON public.professional_services FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "ps owner delete" ON public.professional_services FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);

-- ============ PORTFOLIO ITEMS ============
CREATE TABLE public.portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_pro_idx ON public.portfolio_items(professional_id);
GRANT SELECT ON public.portfolio_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolio_items TO service_role;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio public read" ON public.portfolio_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "portfolio owner write" ON public.portfolio_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "portfolio owner update" ON public.portfolio_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "portfolio owner delete" ON public.portfolio_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);

-- ============ PACKAGES ============
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_pence INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX packages_pro_idx ON public.packages(professional_id);
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages public read" ON public.packages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "packages owner insert" ON public.packages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "packages owner update" ON public.packages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "packages owner delete" ON public.packages FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);

-- ============ QUOTE REQUESTS ============
CREATE TABLE public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  event_date DATE,
  location TEXT,
  budget_band TEXT,
  details TEXT NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'pending',
  quoted_price_pence INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX qr_customer_idx ON public.quote_requests(customer_id);
CREATE INDEX qr_pro_idx ON public.quote_requests(professional_id);
GRANT SELECT, INSERT, UPDATE ON public.quote_requests TO authenticated;
GRANT ALL ON public.quote_requests TO service_role;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr participants read" ON public.quote_requests FOR SELECT TO authenticated USING (
  customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "qr customer insert" ON public.quote_requests FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "qr participants update" ON public.quote_requests FOR UPDATE TO authenticated USING (
  customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE TRIGGER tg_qr_updated BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_qr_idx ON public.messages(quote_request_id);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg participants read" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (
    q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid())
  ))
);
CREATE POLICY "msg participants insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (
    q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid())
  ))
);
CREATE POLICY "msg recipient mark read" ON public.messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND (
    q.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = q.professional_id AND p.user_id = auth.uid())
  ))
);
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============ REVIEWS ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL UNIQUE REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_pro_idx ON public.reviews(professional_id);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "reviews customer insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (
  customer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.quote_requests q WHERE q.id = quote_request_id AND q.customer_id = auth.uid() AND q.status = 'completed'
  )
);

-- Maintain rating_avg / rating_count
CREATE OR REPLACE FUNCTION public.tg_refresh_pro_rating()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.professionals p
  SET rating_count = sub.cnt, rating_avg = COALESCE(sub.avg_, 0)
  FROM (SELECT professional_id, COUNT(*) cnt, AVG(rating)::NUMERIC(3,2) avg_ FROM public.reviews WHERE professional_id = COALESCE(NEW.professional_id, OLD.professional_id) GROUP BY professional_id) sub
  WHERE p.id = sub.professional_id;
  RETURN NULL;
END; $$;
CREATE TRIGGER tg_reviews_rating AFTER INSERT OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_pro_rating();

-- ============ FAVOURITES ============
CREATE TABLE public.favourites (
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, professional_id)
);
GRANT SELECT, INSERT, DELETE ON public.favourites TO authenticated;
GRANT ALL ON public.favourites TO service_role;
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fav self read" ON public.favourites FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "fav self insert" ON public.favourites FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "fav self delete" ON public.favourites FOR DELETE TO authenticated USING (customer_id = auth.uid());

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif self read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
