# BridgeWayRefer design and code audit — November 2026

Scope: the live marketing site (bridgewayrefer.com), the Next.js 16 / React 19 web app (`src/bridgeway-web`), the .NET 10 API (`src/BridgeWay.Api`), and the reference repositories reviewed alongside them. This audit accompanies the uniform-branding change that replaces every legacy mark with the suspension-bridge logo.

## What this change set does

- Replaces the generic "B" mark with the BridgeWayRefer suspension-bridge logo everywhere it can appear: site header, site footer, landing page header and footer, staff sign-in card, staff sidebar, referral intake fallback, favicon, app icon, and the Open Graph / Twitter share image.
- New brand asset set in `src/bridgeway-web/public`:
  - `brand-logo.png` — full logo (bridge + wordmark), transparent background, for light surfaces.
  - `brand-mark.png` — bridge icon only, transparent, used when the wordmark is unnecessary or duplicated.
  - `brand-mark-white.png` — white/sky recolor for dark surfaces (share image, future dark headers).
  - `brand-mark-square.png` — bridge mark on a navy rounded square, for compact slots (staff rail, future app icons).
  - `favicon.ico` plus sized PNG favicons, and a matching `app/icon.svg` with a bold simplified bridge that stays legible at 16px.
  - `share.png` — regenerated 1200x630 OG card: white logo and tagline on navy.
- Removes the dead "B" fallback styles and the old text-wordmark spans; the logo image is now the single source of brand truth in markup.
- Staff sidebar label now reads BridgeWayRefer, matching the logo wordmark.

## Brand and naming

- Pick one user-facing name. Today the logo and domain say BridgeWayRefer, page copy and metadata say BridgeWay, and the footer says BridgeWay again. Recommendation: keep BridgeWayRefer as the legal/product name in the logo and footer fine print, and use BridgeWay consistently in titles, metadata (`siteName`, OG/Twitter tags), and page copy — or go all-in on BridgeWayRefer. Either is fine; mixing both on one page is not.
- The source logo lives in `docs/brand/`. Keep the original there and treat the generated assets in `public/` as build outputs; regenerate rather than hand-edit.
- The wordmark is a geometric sans (very close to the Lato Bold already sitting unused in `public/fonts/Lato-Bold.ttf`). Use Lato for brand/UI text and buttons so the page matches the logo; keep Faustina for editorial/marketing copy if you want the serif voice. Right now Lato is shipped but never referenced — either wire it in via `next/font/local` or delete it.

## Design tokens and CSS

Strengths: one small `globals.css` token file, per-surface stylesheets, no framework churn.

Issues found:

- Misleading and duplicated tokens: `--navy-deep` is actually the light sky blue `#7BC8ED`; `--blue`, `--accent-strong`, and `--silver` are the same value; `--sky` and `--line` are the same `#B0DEF4`. Rename to semantic names (`--brand-navy`, `--brand-sky`, `--brand-sky-soft`) and delete duplicates. This is a 30-minute change that prevents future "which blue?" mistakes.
- Text contrast failures (WCAG AA needs 4.5:1, large text 3:1):
  - `#7BC8ED` text on white is 1.85:1 — used on referral contact link hover, preset numbers, and portal-label spans in `staff.css`, and `button.primary:hover` puts white text on that same light blue.
  - Fix: introduce a darker "action blue" for text and filled buttons (for example `#0E7FC0` is 4.6:1 on white) and reserve `#7BC8ED` for borders, decorative strokes, and backgrounds with navy text.
- Three stylesheets (site/landing/staff) re-implement the same brand header/footer rules (`.brand`, `.bw-brand`, `.staff-sidebar-brand`). Consolidate the brand lockup, buttons, badges, and form controls into one shared layer so the next redesign is a one-file change.

## Typography and layout polish

- Headings mix Faustina serif with tight letter-spacing; at 32px+ this is fine, but dashboard headings (`staff-page-heading h1` at 32px serif) read more "brochure" than "tool". Dashboards benefit from the sans (Lato) for scannability; keep the serif for the marketing site.
- The landing page is genuinely strong (clear hero, industry pages, pricing, FAQ). Biggest wins: real product screenshots instead of the illustrated card mockups, one customer quote per industry page, and JSON-LD structured data (SoftwareApplication + LocalBusiness per industry page) — the sitemap and robots setup is already correct.

## Component architecture

- `LandingPage.tsx` is ~940 lines in one component. Split into section components (`Hero`, `HowItWorks`, `Pricing`, `Faq`, `FooterBand`) — each becomes testable and reusable on industry pages.
- `StaffDashboard.tsx` and `AdminConsole.tsx` pack entire JSX sections into single very long lines. Run Prettier with printWidth ~120 and commit the formatting once, separately from feature changes, so future diffs are readable.
- `PatientForm.tsx` submits raw `FormData` with no client-side validation. Add zod schemas for the intake, signup, and walkthrough forms: parse on submit, show field-level errors, and parse API responses in `lib/api.ts` so a schema drift fails loudly in development instead of rendering `undefined` in production.
- The `api()` wrapper is good (401 handling, workspace header). Add typed zod parsing at the boundary and an `ApiError` subclass for validation failures.

## Dashboard UX (reference mapping)

The Sneat-inspired sidebar from PR #39 is the right foundation. Next steps, mapped to the references you collected:

- Split-pane referral detail (Sneat `app-email` pattern / Adminator queue+detail): clicking an inbox row opens a right-side detail pane with contact, history, owner, and follow-up editor, instead of the current expanding table row. Keep the row visible and selected behind the pane.
- Quick views above the inbox (Sneat chip filters / AdminX filter bar): All, New, Unassigned, Overdue, Mine. The data for these badges already exists in the referral rows.
- Command-palette search (AdminX): "/" or Cmd+K opens a search over referrals, partners, and offices. The staff search box is the seed of this.
- Glass header for the public site (glass-navbar): a sticky translucent header with `backdrop-filter: blur(12px)` over the hero would modernize the marketing pages cheaply. Keep the staff dashboard opaque for readability.
- Material Design cues from Materio (Vuetify) translate to: consistent 8px spacing rhythm, elevated cards only for interactive content, and a proper empty-state illustration component. Do not adopt Vuetify itself — the app is React.
- shadcn/ui: do not migrate wholesale (no Tailwind in this codebase, and the current CSS is clean). Cherry-pick the patterns instead: the Dialog for QR/modals, Toast for "Copied"/"Saved" notices, and Combobox for partner/office pickers. If you ever adopt Tailwind, shadcn becomes the natural component layer — but that is a rewrite, not an update.
- zod: adopt for all form and API boundary validation (see above). It is the highest value-per-hour library on your list.
- sso-referrals: your intake already carries its DNA (consent, partner attribution, per-card links). The piece worth backporting is its explicit, visible audit trail language — consider surfacing "who saw/changed what" in the referral history UI, which the API already records.
- rea, weft, BaerVault: not design references for this product. BaerVault's org-scoped access model (Clerk organizations + RLS) is conceptually what your workspace isolation does with Entra + tenant authorization — no action needed.

Pending from PR #39 (still open): inbox quick views, split-pane details, reporting shortcuts, guided owner setup, mobile layout review, and a physical NFC tap + QR scan verification.

## API and security (brief — this area is strong)

- Program.cs startup validation (HTTPS-only origins, managed identity in production, platform admin required, no dev-database fallback) is exemplary.
- Keep the ETag-based optimistic concurrency on referrals; consider the same pattern for business profile PATCHes if not already present.
- Add a rate-limit smoke test to the CI suite alongside the existing parity/audit tests.
- Stripe webhook signature verification and idempotency are implemented; add one test that replays a tampered webhook and asserts rejection.

## Testing and CI

- 15 Playwright e2e tests pass with the new branding (run locally for this audit). The suite covers the happy paths well; add a visual-regression pass (Playwright `toHaveScreenshot`) for header/footer/intake after this branding change lands, so nobody silently reverts the logo.
- API tests exist and are meaningful (parity, audit readiness, billing plans). Add unit tests for `FollowUpRules` and `MonthlyReport` edge cases (month boundaries in America/Denver timezone).
- `verify.yml` gates deployment on a healthy production baseline — keep that; it caught real regressions in November.

## Priority order

1. Now (done here): one logo everywhere, favicon/OG set, sidebar label, sign-in lockup.
2. Next (hours): rename/dedupe color tokens, fix the 1.85:1 text-contrast usages, wire up or delete Lato, run Prettier once on the two dashboard files.
3. Soon (days): split `LandingPage.tsx`, zod at the form/API boundary, inbox quick-view chips, split-pane referral detail, glass sticky header on marketing pages.
4. Later (weeks): command palette, JSON-LD structured data, customer quotes/screenshots on industry pages, visual-regression tests in CI.
