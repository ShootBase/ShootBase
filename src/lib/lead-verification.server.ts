// LeadVerificationService — abstraction so we can plug in Twilio Lookup /
// Numverify / other telecom validators later. For now this is a stub that
// always returns "unknown", meaning a human admin must resolve the report.
//
// Server-only: do not import from client modules.

export type LeadVerificationResult = "valid" | "invalid" | "unknown";

export type LeadVerificationOutcome = {
  result: LeadVerificationResult;
  provider: string;
  details?: Record<string, unknown>;
};

export async function verifyLeadContact(
  _leadId: string,
  _phone: string | null,
): Promise<LeadVerificationOutcome> {
  // TODO: integrate Twilio Lookup / Numverify here.
  // The contract is intentionally narrow so a future provider can drop in.
  return { result: "unknown", provider: "stub" };
}
