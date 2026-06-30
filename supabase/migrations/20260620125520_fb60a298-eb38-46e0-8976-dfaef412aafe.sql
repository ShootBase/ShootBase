-- Drop stale single-arg overload of calculate_lead_credits (returned wrong base cost)
DROP FUNCTION IF EXISTS public.calculate_lead_credits(numeric);

-- Restrict UPDATE on messages to the read_at column only, preventing participants
-- from mutating body/sender_id while still allowing them to mark messages read.
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;