
-- 1. Restrict sensitive columns on professionals via column-level GRANTs
REVOKE SELECT ON public.professionals FROM anon, authenticated;

GRANT SELECT (
  id, slug, business_name, about, city, country, years_experience,
  cover_image_url, logo_url, website, instagram, facebook, tiktok,
  starting_price_pence, is_verified, status, rating_avg, rating_count,
  avatar_path, avatar_kind, created_at, updated_at
) ON public.professionals TO anon, authenticated;

-- Authenticated users still need INSERT/UPDATE on all columns; RLS row-scopes by user_id
GRANT INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

-- 2. Owner-only RPC to fetch full row including sensitive columns
CREATE OR REPLACE FUNCTION public.get_my_professional()
RETURNS TABLE (
  id uuid, slug text, business_name text, contact_name text, postcode text,
  about text, city text, country text, years_experience integer,
  cover_image_url text, logo_url text, website text, instagram text,
  facebook text, tiktok text, starting_price_pence integer, is_verified boolean,
  status pro_status, rating_avg numeric, rating_count integer,
  avatar_path text, avatar_kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, slug, business_name, contact_name, postcode, about, city, country,
         years_experience, cover_image_url, logo_url, website, instagram, facebook,
         tiktok, starting_price_pence, is_verified, status, rating_avg, rating_count,
         avatar_path, avatar_kind
  FROM public.professionals
  WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_professional() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_professional() TO authenticated;

-- 3. Fix mutable search_path on email queue helpers + lock execute
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$function$;

-- Email queue helpers are server-only (called by service_role from edge routes / triggers)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- 4. Lock auth-required RPCs so anonymous callers cannot reach them
REVOKE EXECUTE ON FUNCTION public.browse_marketplace_leads() FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_job(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_pro_threads() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_unlocked_leads() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_thread_for_me(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_thread_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pro_lead_visibility_debug() FROM anon;
