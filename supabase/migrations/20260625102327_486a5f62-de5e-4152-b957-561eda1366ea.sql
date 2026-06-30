CREATE OR REPLACE FUNCTION public.recompute_user_tags(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pro_id uuid;
  _purchased_90d int := 0;
  _activity_30d int := 0;
  _last_seen timestamptz;
  _created timestamptz;
  _risk text;
  _is_vip boolean := false;
  _is_high boolean := false;
  _is_risky boolean := false;
  _is_inactive boolean := false;
  _vip_threshold int := 500;
  _high_threshold int := 200;
  _inactive_days int := 30;
BEGIN
  SELECT id INTO _pro_id FROM public.professionals WHERE user_id = _user_id;

  IF _pro_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0)::int INTO _purchased_90d
    FROM public.credit_transactions
    WHERE professional_id = _pro_id
      AND amount > 0
      AND transaction_type IN ('credit_purchase','subscription_grant','auto_topup')
      AND created_at >= now() - interval '90 days';
  END IF;

  SELECT COUNT(*)::int INTO _activity_30d
  FROM public.user_activity_log
  WHERE user_id = _user_id
    AND created_at >= now() - interval '30 days';

  SELECT last_sign_in_at, created_at INTO _last_seen, _created
  FROM auth.users WHERE id = _user_id;

  SELECT level INTO _risk FROM public.user_risk_scores WHERE user_id = _user_id;

  IF _risk IN ('high','critical') THEN
    _is_risky := true;
  ELSE
    IF _purchased_90d >= _vip_threshold THEN
      _is_vip := true;
    ELSIF _purchased_90d >= _high_threshold THEN
      _is_high := true;
    END IF;
  END IF;

  IF (_last_seen IS NULL OR _last_seen < now() - (_inactive_days || ' days')::interval)
     AND _activity_30d = 0
     AND COALESCE(_created, now()) < now() - interval '7 days'
  THEN
    _is_inactive := true;
  END IF;

  DELETE FROM public.user_tags WHERE user_id = _user_id AND source = 'auto';

  IF _is_vip THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'vip', 'auto',
      'Spent ' || _purchased_90d || ' coins in last 90 days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_high THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'high_spender', 'auto',
      'Spent ' || _purchased_90d || ' coins in last 90 days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_risky THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'risky', 'auto', 'Risk level: ' || _risk)
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
  IF _is_inactive THEN
    INSERT INTO public.user_tags(user_id, tag, source, reason)
    VALUES (_user_id, 'inactive', 'auto',
      'No sign-in for ' || _inactive_days || '+ days')
    ON CONFLICT (user_id, tag) DO NOTHING;
  END IF;
END $function$;