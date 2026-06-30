// AI-driven risk scoring engine. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RiskSignals = {
  account_age_days: number;
  jobs_count: number;
  messages_24h: number;
  messages_total: number;
  tickets_count: number;
  unlocks_count: number;
  refunds_count: number;
  shared_phone_users: number;
  suspended: boolean;
  email_verified: boolean;
};

export type RiskResult = {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  reasons: string[];
  signals: RiskSignals;
};

function levelFromScore(score: number): RiskResult["level"] {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

export async function gatherSignals(userId: string): Promise<RiskSignals> {
  const [{ data: user }, { data: profile }, { data: jobs }, { data: msgs24 }, { data: msgsTotal }, { data: tickets }, { data: pro }] =
    await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from("profiles").select("phone").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", userId),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId).gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId),
      supabaseAdmin.from("support_requests").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabaseAdmin.from("professionals").select("id").eq("user_id", userId).maybeSingle(),
    ]);

  let unlocks = 0;
  let refunds = 0;
  if (pro) {
    const { count: u } = await supabaseAdmin.from("lead_unlocks").select("id", { count: "exact", head: true }).eq("professional_id", pro.id);
    unlocks = u ?? 0;
    const { count: r } = await supabaseAdmin
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", pro.id)
      .in("transaction_type", ["refund"]);
    refunds = r ?? 0;
  }

  let sharedPhone = 0;
  if (profile?.phone) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("phone", profile.phone)
      .neq("id", userId);
    sharedPhone = count ?? 0;
  }

  const u = user?.user as any;
  const createdAt = u?.created_at ? new Date(u.created_at) : new Date();
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (24 * 3600 * 1000)));

  return {
    account_age_days: accountAgeDays,
    jobs_count: (jobs as any)?.count ?? 0,
    messages_24h: (msgs24 as any)?.count ?? 0,
    messages_total: (msgsTotal as any)?.count ?? 0,
    tickets_count: (tickets as any)?.count ?? 0,
    unlocks_count: unlocks,
    refunds_count: refunds,
    shared_phone_users: sharedPhone,
    suspended: !!u?.banned_until,
    email_verified: !!u?.email_confirmed_at,
  };
}

// Deterministic fallback so a missing AI key never breaks scoring
function ruleScore(signals: RiskSignals): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (signals.account_age_days < 2 && signals.messages_24h > 20) {
    score += 35; reasons.push("New account with very high messaging volume");
  }
  if (signals.messages_24h > 100) { score += 25; reasons.push("Spam-like messaging volume in last 24h"); }
  if (signals.shared_phone_users >= 1) { score += 25; reasons.push(`${signals.shared_phone_users} other account(s) share this phone number`); }
  if (signals.refunds_count >= 2) { score += 20; reasons.push("Multiple refunds or chargebacks"); }
  if (signals.tickets_count > 10) { score += 10; reasons.push("Unusually high support ticket volume"); }
  if (!signals.email_verified && signals.jobs_count > 0) { score += 10; reasons.push("Active without verified email"); }
  if (signals.suspended) { score = Math.max(score, 90); reasons.unshift("Account is currently suspended"); }
  return { score: Math.min(100, score), reasons };
}

export async function computeRisk(userId: string): Promise<RiskResult> {
  const signals = await gatherSignals(userId);
  const fallback = ruleScore(signals);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      score: fallback.score,
      level: levelFromScore(fallback.score),
      reasons: fallback.reasons.length ? fallback.reasons : ["No risk signals detected"],
      signals,
    };
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a fraud-risk analyst for a UK photography marketplace. Given JSON signals about a user, return a JSON object {score:int 0-100, reasons:string[] of 2-4 short bullets}. Score 0-30 low, 31-60 medium, 61-80 high, 81-100 critical. Be conservative. Output ONLY raw JSON, no markdown.",
          },
          { role: "user", content: JSON.stringify(signals) },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const json: any = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const score = Math.max(0, Math.min(100, Number(parsed.score) || fallback.score));
    const reasons = Array.isArray(parsed.reasons) && parsed.reasons.length
      ? parsed.reasons.map((r: any) => String(r)).slice(0, 6)
      : fallback.reasons;
    return { score, level: levelFromScore(score), reasons: reasons.length ? reasons : ["No risk signals detected"], signals };
  } catch {
    return {
      score: fallback.score,
      level: levelFromScore(fallback.score),
      reasons: fallback.reasons.length ? fallback.reasons : ["No risk signals detected"],
      signals,
    };
  }
}
