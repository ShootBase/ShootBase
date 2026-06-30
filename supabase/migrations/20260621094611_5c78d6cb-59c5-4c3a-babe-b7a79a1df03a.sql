
-- Restrict sensitive columns on professionals
REVOKE SELECT (contact_name, postcode) ON public.professionals FROM anon, authenticated;

-- Restrict reviews public exposure
DROP POLICY IF EXISTS "reviews public read" ON public.reviews;

-- Allow owners (customer or the professional being reviewed) to read their own review rows directly.
CREATE POLICY "reviews owner read"
ON public.reviews
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = reviews.professional_id AND p.user_id = auth.uid()
  )
);
