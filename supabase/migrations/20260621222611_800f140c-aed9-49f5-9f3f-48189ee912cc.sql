
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  client_name TEXT NOT NULL,
  client_email TEXT,
  project_description TEXT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal_pence INTEGER NOT NULL DEFAULT 0,
  tax_pence INTEGER NOT NULL DEFAULT 0,
  total_pence INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  business_name TEXT,
  logo_url TEXT,
  brand_color TEXT,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, invoice_number)
);

CREATE INDEX invoices_user_created_idx ON public.invoices (user_id, created_at DESC);
CREATE INDEX invoices_user_status_idx ON public.invoices (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pros can view their own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Pros can insert their own invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros can update their own invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Pros can delete their own invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.invoices_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_set_updated_at();

CREATE OR REPLACE FUNCTION public.invoices_assign_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE next_n INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::INTEGER), 0) + 1
      INTO next_n FROM public.invoices WHERE user_id = NEW.user_id;
    NEW.invoice_number := 'INV-' || LPAD(next_n::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_invoices_assign_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_assign_number();
