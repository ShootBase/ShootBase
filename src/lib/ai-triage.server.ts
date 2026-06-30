// Server-only: classifies a support ticket via Lovable AI Gateway.
// Uses raw fetch to avoid adding the AI SDK dependency for a single call.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type AiPriority = "low" | "medium" | "high" | "urgent";
export type AiSentiment = "positive" | "neutral" | "frustrated" | "angry";

export interface TriageResult {
  priority: AiPriority;
  priority_confidence: number; // 0-100
  sentiment: AiSentiment;
  sentiment_confidence: number; // 0-100
  keywords: string[];
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a support-ticket triage classifier for Shootbase, a UK marketplace for photographers and clients.

Classify each ticket on two axes:

PRIORITY:
- urgent: payment failures, account locked, cannot log in, booking failures, safety issues, disputes, words like "urgent", "asap", "broken", "not working", money/security loss
- high: failed transactions, booking changes/cancellations, system bugs blocking workflow, missing payments or coins
- medium: general support questions, feature usage help, account settings issues
- low: feature requests, general enquiries, non-urgent feedback

SENTIMENT (detect angry customers):
- angry: hostile, threats, profanity, "ridiculous", "useless", "scam", legal threats
- frustrated: complaining, repeated issue, "still broken", "again", impatient
- neutral: factual question, calm tone
- positive: friendly, thankful

Respond ONLY with a JSON object matching this exact shape:
{"priority":"low|medium|high|urgent","priority_confidence":0-100,"sentiment":"positive|neutral|frustrated|angry","sentiment_confidence":0-100,"keywords":["..."],"reasoning":"one short sentence"}`;

export async function classifyTicket(input: {
  category: string | null;
  message: string;
  role: string | null;
}): Promise<TriageResult | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.warn("[ai-triage] LOVABLE_API_KEY missing — skipping classification");
    return null;
  }

  const userContent = `Role: ${input.role ?? "unknown"}
Category: ${input.category ?? "uncategorised"}
Message:
${input.message.slice(0, 4000)}`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[ai-triage] gateway error", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;
    const parsed = JSON.parse(raw);
    const priority = normalisePriority(parsed.priority);
    const sentiment = normaliseSentiment(parsed.sentiment);
    if (!priority || !sentiment) return null;
    return {
      priority,
      priority_confidence: clampPct(parsed.priority_confidence),
      sentiment,
      sentiment_confidence: clampPct(parsed.sentiment_confidence),
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k: unknown): k is string => typeof k === "string").slice(0, 10)
        : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 280) : "",
    };
  } catch (err) {
    console.warn("[ai-triage] failed", err);
    return null;
  }
}

function normalisePriority(v: unknown): AiPriority | null {
  if (v === "low" || v === "medium" || v === "high" || v === "urgent") return v;
  return null;
}
function normaliseSentiment(v: unknown): AiSentiment | null {
  if (v === "positive" || v === "neutral" || v === "frustrated" || v === "angry") return v;
  return null;
}
function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
