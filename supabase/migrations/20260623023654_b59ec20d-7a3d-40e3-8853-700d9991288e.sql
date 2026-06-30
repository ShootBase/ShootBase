-- Preview counts for Launch Cleanup
CREATE OR REPLACE FUNCTION public.admin_launch_cleanup_preview(_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.staff_role;
  _out jsonb := '{}'::jsonb;
BEGIN
  SELECT role INTO _role FROM public.staff_accounts
   WHERE user_id = auth.uid() AND status = 'active';
  IF _role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _mode NOT IN ('soft','full') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  _out := jsonb_build_object(
    'mode', _mode,
    'credit_transactions',  (SELECT count(*) FROM public.credit_transactions),
    'credit_subscriptions', (SELECT count(*) FROM public.credit_subscriptions),
    'invoices',             (SELECT count(*) FROM public.invoices),
    'lead_unlocks',         (SELECT count(*) FROM public.lead_unlocks),
    'lead_matches',         (SELECT count(*) FROM public.lead_matches),
    'lead_match_notifications', (SELECT count(*) FROM public.lead_match_notifications),
    'pro_lead_views',       (SELECT count(*) FROM public.pro_lead_views),
    'pro_lead_dismissals',  (SELECT count(*) FROM public.pro_lead_dismissals),
    'pro_lead_favourites',  (SELECT count(*) FROM public.pro_lead_favourites),
    'user_activity_log',    (SELECT count(*) FROM public.user_activity_log),
    'message_email_notifications', (SELECT count(*) FROM public.message_email_notifications),
    'promo_redemptions',    (SELECT count(*) FROM public.promo_redemptions)
  );

  IF _mode = 'full' THEN
    _out := _out || jsonb_build_object(
      'support_requests',   (SELECT count(*) FROM public.support_requests),
      'admin_notes',        (SELECT count(*) FROM public.admin_notes),
      'jobs',               (SELECT count(*) FROM public.jobs),
      'quote_requests',     (SELECT count(*) FROM public.quote_requests),
      'messages',           (SELECT count(*) FROM public.messages),
      'reviews',            (SELECT count(*) FROM public.reviews),
      'review_replies',     (SELECT count(*) FROM public.review_replies),
      'review_reports',     (SELECT count(*) FROM public.review_reports),
      'notifications',      (SELECT count(*) FROM public.notifications),
      'favourites',         (SELECT count(*) FROM public.favourites),
      'portfolio_items',    (SELECT count(*) FROM public.portfolio_items),
      'pro_contact_requests', (SELECT count(*) FROM public.pro_contact_requests),
      'professionals',      (SELECT count(*) FROM public.professionals),
      'user_tags',          (SELECT count(*) FROM public.user_tags),
      'vip_rewards',        (SELECT count(*) FROM public.vip_rewards),
      'user_risk_scores',   (SELECT count(*) FROM public.user_risk_scores),
      'promo_codes',        (SELECT count(*) FROM public.promo_codes),
      'referral_codes',     (SELECT count(*) FROM public.referral_codes),
      'profiles_non_super_admin', (
        SELECT count(*) FROM public.profiles p
        WHERE NOT EXISTS (
          SELECT 1 FROM public.staff_accounts s
          WHERE s.user_id = p.id AND s.status = 'active' AND s.role = 'super_admin'
        )
      )
    );
  END IF;

  RETURN _out;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_launch_cleanup_preview(text) TO authenticated;

-- Run the cleanup
CREATE OR REPLACE FUNCTION public.admin_launch_cleanup_run(_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.staff_role;
  _removed jsonb := '{}'::jsonb;
  _n bigint;
  _welcome int;
BEGIN
  SELECT role INTO _role FROM public.staff_accounts
   WHERE user_id = auth.uid() AND status = 'active';
  IF _role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _mode NOT IN ('soft','full') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  -- Common (soft) wipes: analytics, coin/payment history, lead/activity history.
  WITH d AS (DELETE FROM public.credit_transactions RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('credit_transactions', _n);

  WITH d AS (DELETE FROM public.credit_subscriptions RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('credit_subscriptions', _n);

  WITH d AS (DELETE FROM public.invoices RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('invoices', _n);

  WITH d AS (DELETE FROM public.lead_unlocks RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('lead_unlocks', _n);

  WITH d AS (DELETE FROM public.lead_match_notifications RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('lead_match_notifications', _n);

  WITH d AS (DELETE FROM public.lead_matches RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('lead_matches', _n);

  WITH d AS (DELETE FROM public.pro_lead_views RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('pro_lead_views', _n);

  WITH d AS (DELETE FROM public.pro_lead_dismissals RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('pro_lead_dismissals', _n);

  WITH d AS (DELETE FROM public.pro_lead_favourites RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('pro_lead_favourites', _n);

  WITH d AS (DELETE FROM public.user_activity_log RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('user_activity_log', _n);

  WITH d AS (DELETE FROM public.message_email_notifications RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('message_email_notifications', _n);

  WITH d AS (DELETE FROM public.promo_redemptions RETURNING 1)
    SELECT count(*) INTO _n FROM d;
  _removed := _removed || jsonb_build_object('promo_redemptions', _n);

  -- Reset coin balances to the configured welcome bonus.
  SELECT welcome_bonus INTO _welcome FROM public.credit_settings WHERE id = 1;
  UPDATE public.professional_credits
     SET credit_balance = COALESCE(_welcome, 0),
         lifetime_purchased = 0,
         lifetime_spent = 0;

  IF _mode = 'full' THEN
    WITH d AS (DELETE FROM public.admin_notes RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('admin_notes', _n);

    WITH d AS (DELETE FROM public.support_requests RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('support_requests', _n);

    WITH d AS (DELETE FROM public.messages RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('messages', _n);

    WITH d AS (DELETE FROM public.review_replies RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('review_replies', _n);

    WITH d AS (DELETE FROM public.review_reports RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('review_reports', _n);

    WITH d AS (DELETE FROM public.reviews RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('reviews', _n);

    WITH d AS (DELETE FROM public.pro_contact_requests RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('pro_contact_requests', _n);

    WITH d AS (DELETE FROM public.quote_requests RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('quote_requests', _n);

    WITH d AS (DELETE FROM public.job_attachments RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('job_attachments', _n);

    WITH d AS (DELETE FROM public.jobs RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('jobs', _n);

    WITH d AS (DELETE FROM public.favourites RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('favourites', _n);

    WITH d AS (DELETE FROM public.notifications RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('notifications', _n);

    WITH d AS (DELETE FROM public.portfolio_items RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('portfolio_items', _n);

    WITH d AS (DELETE FROM public.professional_services RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('professional_services', _n);

    WITH d AS (DELETE FROM public.professional_credits RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('professional_credits', _n);

    WITH d AS (DELETE FROM public.pro_notification_prefs RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('pro_notification_prefs', _n);

    WITH d AS (DELETE FROM public.professionals RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('professionals', _n);

    WITH d AS (DELETE FROM public.user_tags RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('user_tags', _n);

    WITH d AS (DELETE FROM public.vip_rewards RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('vip_rewards', _n);

    WITH d AS (DELETE FROM public.user_risk_scores RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('user_risk_scores', _n);

    WITH d AS (DELETE FROM public.promo_codes RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('promo_codes', _n);

    WITH d AS (DELETE FROM public.referral_codes RETURNING 1)
      SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('referral_codes', _n);

    -- Delete profiles for everyone except active super_admins. The matching
    -- auth.users rows are deleted from TS via the admin API after this RPC.
    WITH d AS (
      DELETE FROM public.profiles p
       WHERE NOT EXISTS (
         SELECT 1 FROM public.staff_accounts s
         WHERE s.user_id = p.id AND s.status = 'active' AND s.role = 'super_admin'
       )
      RETURNING 1
    )
    SELECT count(*) INTO _n FROM d;
    _removed := _removed || jsonb_build_object('profiles_deleted', _n);
  END IF;

  PERFORM public.log_admin_action(
    'launch_cleanup.run',
    'system',
    _mode,
    jsonb_build_object('mode', _mode, 'removed', _removed)
  );

  RETURN jsonb_build_object('mode', _mode, 'removed', _removed);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_launch_cleanup_run(text) TO authenticated;