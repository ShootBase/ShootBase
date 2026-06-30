#!/usr/bin/env python3
"""
End-to-end test for the lead marketplace.

Flow:
  1. Seed test customer + pro (5 starting credits, no extra) via /api/public/seed-test-accounts
  2. Customer posts a wedding photography lead in London (£2000)
  3. Pro views matched lead — contact details masked
  4. Pro attempts unlock — should fail (5 < 8 credits)
  5. Top up pro to 8+ credits via the seed endpoint (simulates a credit purchase)
  6. Pro unlocks the lead — customer email + phone now visible

Env vars required:
  BASE_URL          e.g. http://localhost:8080  (default)
  TEST_SEED_TOKEN   must match the project secret of the same name
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
SEED_TOKEN = os.environ.get("TEST_SEED_TOKEN")
SCREENS = Path(__file__).parent / "screenshots"
SCREENS.mkdir(parents=True, exist_ok=True)

CUSTOMER_EMAIL = "test-customer@captureconnect.test"
PRO_EMAIL = "test-pro@captureconnect.test"
PASSWORD = "TestPass!2026"


def seed(grant_credits: int = 0, keep_jobs: bool = False) -> dict:
    if not SEED_TOKEN:
        sys.exit("TEST_SEED_TOKEN env var not set")
    body = json.dumps({"grantCredits": grant_credits, "keepJobs": keep_jobs}).encode()
    req = Request(
        f"{BASE_URL}/api/public/seed-test-accounts",
        data=body,
        method="POST",
        headers={"content-type": "application/json", "x-seed-token": SEED_TOKEN},
    )
    with urlopen(req) as r:
        return json.loads(r.read().decode())


async def sign_in(page, email: str):
    await page.goto(f"{BASE_URL}/auth", wait_until="networkidle")
    await page.wait_for_timeout(500)
    # Force sign-in mode (defaults already to signin)
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', PASSWORD)
    await page.get_by_role("button", name="Sign in", exact=False).click()
    await page.wait_for_url(lambda u: "/auth" not in u, timeout=15_000)


async def sign_out(page):
    # Clear local storage so the next sign-in starts clean
    await page.evaluate("() => window.localStorage.clear()")


async def main():
    print(f"Seeding accounts (5 starting credits, no extra) at {BASE_URL}…")
    s = seed(grant_credits=0)
    print("  customer:", s["customer"]["email"])
    print("  pro:     ", s["professional"]["email"])

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # ---------- 1. Customer posts a wedding lead in London ----------
        await sign_in(page, CUSTOMER_EMAIL)
        await page.goto(f"{BASE_URL}/customer/post-lead", wait_until="domcontentloaded")
        await page.wait_for_selector("select", timeout=10_000)
        await page.screenshot(path=str(SCREENS / "01_post_lead_form.png"))

        # Pick wedding photography service
        await page.select_option("select >> nth=0", label="Wedding Photography")
        await page.fill('input[placeholder="London"]', "London")
        await page.fill('input[placeholder*="Wedding"]', "Wedding photographer needed — June")
        # Budget select (3rd select on page)
        await page.select_option("select >> nth=1", index=3)  # any non-empty band
        await page.fill("textarea", "Looking for a wedding photographer in London. Budget around £2000. Full day coverage, 200 guests.")
        await page.get_by_role("button", name="Post job").click()
        await page.wait_for_selector("text=Wedding photographer needed", timeout=10_000)
        await page.screenshot(path=str(SCREENS / "02_lead_posted.png"))
        print("✓ Customer posted lead")
        await sign_out(page)

        # ---------- 2. Pro sees lead, contact masked ----------
        await sign_in(page, PRO_EMAIL)
        await page.goto(f"{BASE_URL}/pro/leads", wait_until="domcontentloaded")
        await page.wait_for_selector("text=Wedding photographer needed", timeout=10_000)
        await page.screenshot(path=str(SCREENS / "03_pro_leads_locked.png"))
        page_text = await page.inner_text("body")
        assert CUSTOMER_EMAIL not in page_text, "Customer email leaked before unlock!"
        assert "+447700900000" not in page_text, "Customer phone leaked before unlock!"
        print("✓ Pro sees lead with contact details hidden")

        # ---------- 3. With 5 credits, unlock button is disabled (need 8) ----------
        unlock_btn = page.locator("button:has-text('Unlock ·')").first
        await expect(unlock_btn).to_be_visible()
        await expect(unlock_btn).to_be_disabled()
        btn_text = (await unlock_btn.inner_text()).strip()
        assert "8 credits" in btn_text.lower(), f"Expected unlock cost 8 in button, got: {btn_text}"
        await page.screenshot(path=str(SCREENS / "04_unlock_disabled.png"))
        print("✓ Unlock blocked: button disabled (5 < 8 credits)")

        # ---------- 4. Simulate credit purchase via seed top-up ----------
        print("Topping up pro with 8 credits (simulates Stripe purchase)…")
        seed(grant_credits=8, keep_jobs=True)  # 5 + 8 = 13, preserve posted lead

        # ---------- 5. Verify balance updated ----------
        await page.goto(f"{BASE_URL}/pro/credits", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SCREENS / "05_balance_topped_up.png"))
        credits_text = await page.inner_text("body")
        assert "13" in credits_text, f"Expected balance 13 visible, got: {credits_text[:300]}"
        print("✓ Credit balance updated to 13")

        # ---------- 6. Unlock + see customer details ----------
        await page.goto(f"{BASE_URL}/pro/leads", wait_until="domcontentloaded")
        await page.wait_for_selector("text=Wedding photographer needed", timeout=10_000)
        unlock_btn2 = page.locator("button:has-text('Unlock ·')").first
        await expect(unlock_btn2).to_be_enabled()
        await unlock_btn2.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SCREENS / "06_unlocked.png"))
        revealed = (await page.inner_text("body")).lower()
        assert CUSTOMER_EMAIL.lower() in revealed, "Customer email NOT revealed after unlock"
        assert "+447700900000" in revealed, "Customer phone NOT revealed after unlock"
        print("✓ Customer email + phone visible after unlock")

        await browser.close()
        print("\nAll checks passed. Screenshots:", SCREENS)


if __name__ == "__main__":
    asyncio.run(main())
