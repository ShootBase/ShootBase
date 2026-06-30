CREATE OR REPLACE FUNCTION public.tg_match_pros_on_new_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pro RECORD; _count INTEGER := 0; _max INTEGER := 5;
BEGIN
  IF NEW.status <> 'open' OR NEW.service_id IS NULL THEN RETURN NEW; END IF;
  FOR _pro IN
    SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
    FROM public.professional_services ps
    JOIN public.professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = NEW.service_id AND pr.status = 'active' AND pr.city ILIKE NEW.city
    ORDER BY pr.rating_avg DESC NULLS LAST LIMIT _max
  LOOP
    INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications (user_id, title, body, url)
      VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
    _count := _count + 1;
  END LOOP;
  IF _count < 3 THEN
    FOR _pro IN
      SELECT DISTINCT pr.id, pr.user_id, pr.rating_avg
      FROM public.professional_services ps JOIN public.professionals pr ON pr.id = ps.professional_id
      WHERE ps.service_id = NEW.service_id AND pr.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM public.lead_matches lm WHERE lm.job_id = NEW.id AND lm.professional_id = pr.id)
      ORDER BY pr.rating_avg DESC NULLS LAST LIMIT (_max - _count)
    LOOP
      INSERT INTO public.lead_matches (job_id, professional_id) VALUES (NEW.id, _pro.id) ON CONFLICT DO NOTHING;
      INSERT INTO public.notifications (user_id, title, body, url)
        VALUES (_pro.user_id, 'New ' || NEW.title || ' lead', 'New lead in ' || NEW.city || '. Unlock to view customer details.', '/pro/leads');
      _count := _count + 1; EXIT WHEN _count >= 3;
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;