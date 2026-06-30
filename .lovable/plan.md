# Premium Dashboard Redesign — Pro & Client

UI-only refresh of the Professional and Client dashboards into a native-app-feeling SaaS experience. No backend, RLS, country-isolation, payments, leads, messaging, credits, or invoice logic will change. All data sources stay exactly as they are today — we just re-skin and re-compose.

Applies equally to **GB and NG** (shared codebase, country values flow through existing hooks). No country-specific UI branches except currency/locale formatters that already exist (`src/lib/format.ts`, `country-pricing.ts`).

## Visual system (added to `src/styles.css`)

New ShootBase tokens layered on top of the existing palette — no hardcoded colors in components:

```text
--sb-bg          #FAF8F4   warm off-white
--sb-surface     #FFFFFF
--sb-beige       #F3EFE7
--sb-border      #E7E1D8
--sb-ink         #1F1F1F   charcoal
--sb-ink-deep    #080808
--sb-gold        #C89B3C   single accent
--sb-success     existing green
--sb-danger      existing red
```

Plus tokens for radius (`--radius-card: 20px`), elevation (`--shadow-card`, `--shadow-pop`), and a `--gradient-hero` for the dark hero card. Typography keeps the existing display + body pair; we only tighten scale and tracking on dashboard surfaces.

## Files changed (UI layer only)

**New components**
- `src/components/site/DashboardShell.tsx` — shared shell with persistent desktop sidebar, sticky top bar (logo, country switcher, notifications, avatar menu), and slide-out drawer + bottom tab bar for mobile. Replaces the ad-hoc layout currently inside `ProShell.tsx` and the client dashboard.
- `src/components/site/BottomTabBar.tsx` — 5-tab native-style nav. Tab sets differ by role (Pro: Dashboard / Projects / Messages / Leads / Profile · Client: Dashboard / My Jobs / Messages / Responses / Profile).
- `src/components/site/SidebarNav.tsx` — desktop sidebar with role-aware sections and the "Stand out. Get hired." promo card at the bottom.
- `src/components/dashboard/HeroCard.tsx` — dark gradient hero with greeting, dynamic subtext, and CTAs. Reused by both roles with different copy/CTAs.
- `src/components/dashboard/StatTile.tsx` — compact metric tile (icon, value, label, delta).
- `src/components/dashboard/ProgressRing.tsx` — gold progress ring for profile completion.
- `src/components/dashboard/NextStepsList.tsx` — horizontal/stacked action tiles (replaces the Bark-style numbered timeline).
- `src/components/dashboard/SectionCard.tsx` — rounded card primitive with title row + "View all" link.
- `src/components/dashboard/OpportunityCard.tsx` — project tile reusing existing `LeadBadges` (quality, freshness) and currency from `format.ts`.
- `src/components/dashboard/JobStatusCard.tsx` — client-side job status tile.
- `src/components/dashboard/ResponseCard.tsx` — client-side pro response tile.
- `src/components/dashboard/TrustSafetyCard.tsx` — client reassurance card.

**Rewritten (UI only, same data hooks/queries)**
- `src/routes/_authenticated/pro.dashboard.tsx` — recomposed using the new shell + sections: Hero · Today's Opportunities · Profile Completion (ring) · Activity Snapshot · Portfolio Performance (with empty state) · Recommended Next Steps.
- `src/routes/_authenticated/dashboard.tsx` (client) — recomposed: Hero · Job Status Overview · My Recent Jobs · Professional Responses · Recommended Actions · Trust & Safety.
- `src/components/site/ProShell.tsx` — thin adapter that delegates to `DashboardShell` with the Pro nav config (kept for import-stability).
- `src/components/site/ClientMobileNav.tsx` — replaced by `BottomTabBar` (file becomes a re-export to avoid breaking imports, then deleted in a follow-up).

**Touched for styling tokens only**
- `src/styles.css` — add the tokens above and a couple of utility classes (`.sb-card`, `.sb-hero`).

Everything else — server functions, RPCs, RLS, country detection, payments, Twilio, queues, admin — is untouched.

## Layout behaviour

- **Desktop (≥1024px):** fixed 260px sidebar, sticky top bar, 12-col content grid (hero spans 8, profile ring spans 4; opportunities 8 / activity 4; etc.).
- **Tablet (640–1023px):** sidebar collapses to icon rail or hamburger drawer (matches existing 1024px breakpoint already used in `ProShell`). 2-col card grid.
- **Mobile (<640px):** top bar (logo · hamburger · country · bell), single-column stacked cards, sticky bottom tab bar with 5 items, full menu in slide-out drawer. Tap targets ≥44px (existing `.dashboard-readable` scope kept).

## Data & dynamic copy

All metrics already exist in the current dashboards (new opportunities count, unread messages, credit balance, profile completion %, response rate, recent unlocks, recent replies). We bind the new components to the same queries — no new server functions. Dynamic strings ("3 new projects match your profile today", "1 client replied", "Your response rate is 92%") are derived client-side from those values with a fallback empty state when zero.

Currency, distance units, and city/region lists continue to flow from `src/lib/format.ts`, `src/lib/units.ts`, `src/lib/locations.ts` — automatically correct for GB and NG.

## Performance

- Lazy-load `OpportunityCard` images with `loading="lazy"` and existing responsive `srcSet` helpers.
- Skeleton states (`Skeleton` from shadcn) on every section card while its query is pending.
- No new heavy deps; framer-motion (already installed) used sparingly for hero entrance + tab-bar active indicator.

## Verification checklist before completion

1. `tsgo` clean, build clean.
2. Visit `/pro/dashboard` and `/dashboard` as Pro and Client at desktop/tablet/mobile viewports.
3. Toggle `/preview/ng` and confirm ₦ currency, NG cities, NG payment CTAs render in the new components.
4. Confirm sidebar, drawer, bottom-tab, notification bell, country switcher, and sign-out all still function (wired to existing handlers in `ProShell`/`AdminShell`).
5. Report back the exact list of changed files and confirm no server function, migration, RLS policy, or country helper was modified.
