ALTER TABLE public.jobs REPLICA IDENTITY DEFAULT;
ALTER TABLE public.quote_requests REPLICA IDENTITY DEFAULT;
ALTER TABLE public.professionals REPLICA IDENTITY DEFAULT;
ALTER TABLE public.pro_contact_requests REPLICA IDENTITY DEFAULT;

ALTER PUBLICATION supabase_realtime DROP TABLE public.jobs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.quote_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_requests;