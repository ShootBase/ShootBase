
-- Restore Data API grants on professionals. RLS still enforces row access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

-- Keep anon limited to non-PII columns for public marketplace browsing.
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT (
  id, slug, business_name, about, city, country, years_experience,
  cover_image_url, logo_url, website, instagram, facebook, tiktok,
  starting_price_pence, is_verified, status, rating_avg, rating_count,
  avatar_path, avatar_kind, created_at, updated_at
) ON public.professionals TO anon;
