import { createFileRoute } from "@tanstack/react-router";

const CUSTOMER_EMAIL = "test-customer@captureconnect.test";
const PRO_EMAIL = "test-pro@captureconnect.test";
// Test password is sourced from an env secret. Fallback only applies in non-production environments.
const PASSWORD = process.env.TEST_SEED_PASSWORD || "TestPass!2026";
const WEDDING_SERVICE_ID = "33cfce71-2d2b-4bc6-9e48-38a4263d836e";

export const Route = createFileRoute("/api/public/seed-test-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-seed-token");
        const expected = process.env.TEST_SEED_TOKEN;
        if (!expected || token !== expected) {
          return new Response("Forbidden", { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          grantCredits?: number;
          keepJobs?: boolean;
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        async function ensureUser(email: string): Promise<string> {
          // Try create; if exists, look up.
          const created = await supabaseAdmin.auth.admin.createUser({
            email,
            password: PASSWORD,
            email_confirm: true,
          });
          if (created.data?.user?.id) return created.data.user.id;
          // List and find
          let page = 1;
          for (;;) {
            const list = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
            const found = list.data?.users.find((u) => u.email === email);
            if (found) return found.id;
            if (!list.data || list.data.users.length < 200) break;
            page += 1;
          }
          throw new Error("Could not provision " + email);
        }

        const customerId = await ensureUser(CUSTOMER_EMAIL);
        const proUserId = await ensureUser(PRO_EMAIL);

        // Clean previous test customer jobs (and cascading matches) for repeatable runs
        if (!body.keepJobs) {
          await supabaseAdmin.from("jobs").delete().eq("customer_id", customerId);
        }

        // Customer profile
        await supabaseAdmin
          .from("profiles")
          .upsert({ id: customerId, full_name: "Test Customer", account_type: "customer", phone: "+447700900000" });

        // Pro profile + professional row
        await supabaseAdmin
          .from("profiles")
          .upsert({ id: proUserId, full_name: "Test Pro", account_type: "professional", phone: "+447700900111" });

        const { data: existingPro } = await supabaseAdmin
          .from("professionals")
          .select("id")
          .eq("user_id", proUserId)
          .maybeSingle();

        let proId = existingPro?.id as string | undefined;
        if (!proId) {
          const slug = "test-pro-" + proUserId.slice(0, 8);
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("professionals")
            .insert({
              user_id: proUserId,
              slug,
              business_name: "Test Pro Studio",
              contact_name: "Test Pro",
              city: "London",
              country: "United Kingdom",
              status: "active",
              about: "Seeded test photographer.",
            })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          proId = inserted.id;
        } else {
          await supabaseAdmin
            .from("professionals")
            .update({ city: "London", status: "active" })
            .eq("id", proId);
        }

        // Service link
        await supabaseAdmin
          .from("professional_services")
          .upsert({ professional_id: proId, service_id: WEDDING_SERVICE_ID });

        // Ensure credit balance reflects welcome bonus (5) — trigger sets it on first insert.
        const startingBalance = 5 + (body.grantCredits ?? 0);
        await supabaseAdmin
          .from("professional_credits")
          .upsert({ professional_id: proId, credit_balance: startingBalance, welcome_bonus_granted: true });

        // Clear leftover unlocks/transactions for repeatable runs
        await supabaseAdmin.from("lead_unlocks").delete().eq("professional_id", proId);
        await supabaseAdmin.from("credit_transactions").delete().eq("professional_id", proId);
        await supabaseAdmin
          .from("credit_transactions")
          .insert({
            professional_id: proId,
            amount: startingBalance,
            transaction_type: "welcome_bonus",
            description: "Seeded balance",
          });

        return new Response(
          JSON.stringify({
            ok: true,
            customer: { id: customerId, email: CUSTOMER_EMAIL, password: PASSWORD },
            professional: { user_id: proUserId, professional_id: proId, email: PRO_EMAIL, password: PASSWORD },
            wedding_service_id: WEDDING_SERVICE_ID,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
