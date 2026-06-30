
-- Helper: is current user a participant of a quote_request (thread)
CREATE OR REPLACE FUNCTION public.is_thread_participant(_qr uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quote_requests q
    WHERE q.id = _qr
      AND (
        q.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.professionals p
          WHERE p.id = q.professional_id AND p.user_id = auth.uid()
        )
      )
  );
$$;

-- Table
CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  quote_request_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_attachments_msg_idx ON public.message_attachments(message_id);
CREATE INDEX message_attachments_qr_idx ON public.message_attachments(quote_request_id);

GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments participants read"
  ON public.message_attachments FOR SELECT TO authenticated
  USING (public.is_thread_participant(quote_request_id));

CREATE POLICY "attachments participants insert"
  ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.is_thread_participant(quote_request_id)
  );

CREATE POLICY "attachments uploader delete"
  ON public.message_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- Storage RLS for the message-attachments bucket.
-- Path convention: {quote_request_id}/{uuid}-{filename}
CREATE POLICY "msg-attachments participants read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_thread_participant(
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "msg-attachments participants insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND owner = auth.uid()
    AND public.is_thread_participant(
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "msg-attachments owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND owner = auth.uid()
  );
