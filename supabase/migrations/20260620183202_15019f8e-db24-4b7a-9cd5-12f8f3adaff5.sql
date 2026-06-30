ALTER PUBLICATION supabase_realtime DROP TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs (
  id, customer_id, service_id, kind, title, summary, details, city,
  event_date, event_time, budget_band, status, expires_at, flexible_dates,
  duration, preferred_contact, inspiration_links, duration_days,
  duration_start_date, duration_end_date, duration_consecutive,
  duration_flexible, duration_hours, urgency_status, unlock_credit_cost,
  max_responses, event_type, created_at, updated_at, urgency,
  client_display_name, show_name_to_pros
);