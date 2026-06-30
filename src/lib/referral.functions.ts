import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REFERRAL_BONUS = 15;
const PURCHASE_THRESHOLD = 50;

export const redeemReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Caller must have a professional record.
    const { data: myPro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!myPro) return { granted: false, reason: "not_a_pro" as const };

    // Resolve referrer by slug.
    const { data: refPro } = await supabase
      .from("professionals")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!refPro || refPro.id === myPro.id) {
      return { granted: false, reason: "invalid_referrer" as const };
    }

    // Ensure my credit row exists.
    const { data: myCredits } = await supabase
      .from("professional_credits")
      .select("credit_balance, referral_bonus_granted, referred_by_pro_id")
      .eq("professional_id", myPro.id)
      .maybeSingle();
    if (!myCredits) {
      await supabase
        .from("professional_credits")
        .insert({ professional_id: myPro.id, credit_balance: 0 });
    }
    if (myCredits?.referral_bonus_granted) {
      return { granted: false, reason: "already_granted" as const };
    }

    // Persist the referrer link immediately so it survives until threshold is met.
    if (!myCredits?.referred_by_pro_id) {
      await supabase
        .from("professional_credits")
        .update({ referred_by_pro_id: refPro.id })
        .eq("professional_id", myPro.id);
    }

    // Gate: new pro must have purchased at least 50 credits in total.
    const { data: purchaseTx } = await supabase
      .from("credit_transactions")
      .select("amount")
      .eq("professional_id", myPro.id)
      .eq("transaction_type", "credit_purchase");
    const purchasedTotal = (purchaseTx ?? []).reduce(
      (s, r) => s + Math.max(0, Number(r.amount ?? 0)),
      0,
    );
    if (purchasedTotal < PURCHASE_THRESHOLD) {
      return { granted: false, reason: "purchase_threshold_not_met" as const, purchased: purchasedTotal, required: PURCHASE_THRESHOLD };
    }

    // Mark first so concurrent calls don't double-pay.
    const { data: marked, error: markErr } = await supabase
      .from("professional_credits")
      .update({ referral_bonus_granted: true, referred_by_pro_id: refPro.id })
      .eq("professional_id", myPro.id)
      .eq("referral_bonus_granted", false)
      .select("professional_id")
      .maybeSingle();
    if (markErr || !marked) return { granted: false, reason: "already_granted" as const };

    // Credit the new pro.
    const myBalance = (myCredits?.credit_balance ?? 0) + REFERRAL_BONUS;
    await supabase
      .from("professional_credits")
      .update({ credit_balance: myBalance })
      .eq("professional_id", myPro.id);
    await supabase.from("credit_transactions").insert({
      professional_id: myPro.id,
      amount: REFERRAL_BONUS,
      transaction_type: "admin_adjustment",
      description: "Referral bonus — welcome to Shootbase",
    });

    // Credit the referrer (ensure row exists first).
    const { data: refCredits } = await supabase
      .from("professional_credits")
      .select("credit_balance")
      .eq("professional_id", refPro.id)
      .maybeSingle();
    if (!refCredits) {
      await supabase
        .from("professional_credits")
        .insert({ professional_id: refPro.id, credit_balance: REFERRAL_BONUS });
    } else {
      await supabase
        .from("professional_credits")
        .update({ credit_balance: (refCredits.credit_balance ?? 0) + REFERRAL_BONUS })
        .eq("professional_id", refPro.id);
    }
    await supabase.from("credit_transactions").insert({
      professional_id: refPro.id,
      amount: REFERRAL_BONUS,
      transaction_type: "admin_adjustment",
      description: "Referral bonus — thanks for inviting a friend",
    });

    return { granted: true, amount: REFERRAL_BONUS };
  });
