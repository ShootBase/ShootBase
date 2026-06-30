
UPDATE public.credit_settings SET unlock_cost = 8, updated_at = now() WHERE id = 1;

CREATE OR REPLACE FUNCTION public.calculate_lead_credits(_hours numeric, _budget_band text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (_hours IS NOT NULL AND _hours >= 6)
      OR _budget_band IN ('500-1000', '1000-2500', '2500+')
    THEN 10 ELSE 8 END;
$function$;

-- Backfill open jobs with the new pricing
UPDATE public.jobs
SET unlock_credit_cost = public.calculate_lead_credits(duration_hours, budget_band)
WHERE status = 'open';
