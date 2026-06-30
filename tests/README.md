# Marketplace E2E Test

End-to-end test for the lead marketplace covering:

- Customer posts a wedding photography lead in London (£2000)
- Pro sees the lead with contact details hidden
- Pro fails to unlock with 5 starting credits (cost is 8)
- After a simulated credit purchase, balance updates
- Pro unlocks the lead and sees the customer's email and phone

## Test accounts

| Role     | Email                                 | Password        |
|----------|---------------------------------------|-----------------|
| Customer | `test-customer@captureconnect.test`   | `TestPass!2026` |
| Pro      | `test-pro@captureconnect.test`        | `TestPass!2026` |

The pro is seeded as an active "Wedding Photography" specialist in London.

## Setup

1. Set the `TEST_SEED_TOKEN` project secret (any random string).
2. Make sure the dev server is running.

## Run

```bash
TEST_SEED_TOKEN=<your-token> python tests/marketplace_e2e.py
```

For the published site:

```bash
BASE_URL=https://yourapp.lovable.app TEST_SEED_TOKEN=<token> python tests/marketplace_e2e.py
```

Screenshots are written to `tests/screenshots/`.

## What the seed endpoint does

`POST /api/public/seed-test-accounts` (with header `x-seed-token: <TEST_SEED_TOKEN>`)
provisions the two test accounts, gives the pro a London "Wedding Photography"
profile, deletes the customer's previous test jobs and the pro's prior
unlocks/transactions, and resets the credit balance to `5 + grantCredits`.

```bash
curl -X POST $BASE_URL/api/public/seed-test-accounts \
  -H "x-seed-token: $TEST_SEED_TOKEN" \
  -H "content-type: application/json" \
  -d '{"grantCredits": 0}'
```

## Lead expiry

Leads expire after the number of days configured in `credit_settings.lead_expiry_days`
(default 7). Admins can change this from `/admin/settings`. Expired leads cannot
be unlocked — `unlock_job()` raises `LEAD_EXPIRED`.

## Stripe purchase path (manual)

The automated test bypasses Stripe via the seed top-up to stay deterministic.
To verify the real purchase flow manually:

1. Sign in as the test pro.
2. Go to `/pro/credits`, pick a package, complete checkout with test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. After redirect to `/pro/credits/success`, confirm the balance increased and the transaction shows in the history.
