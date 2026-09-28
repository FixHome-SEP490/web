# Landing page redesign — 28/09/2026

## Scope and implementation

Web branch `Truonghoang`, starting commit `295c116`. Design-system version 1.0.1. Primary actor: Customer; technician participation is secondary.

The landing page now presents seven chapters: introduction, catalog, process, preliminary AI diagnosis, technician trust, questions, and booking. The public layout supplies shared navigation and footer. Booking actions use `/app/bookings/new` and preserve the existing authentication and role guards. AI is part of the existing booking wizard, not a new endpoint or route.

The user's follow-up explicitly requested pinned scroll storytelling, layered parallax, marquee text and smooth transitions. Section 9.1 of the canonical design system records that decision and is mirrored across the workspace. Desktop scenes pin only when their content fits. Narrow/short screens and reduced-motion preferences use normal document flow. Native scrolling is preserved; a single scheduled animation frame updates progress. Listeners and observers are removed on unmount. No dependency was added.

Reused: `FhButton`, `FhSkeleton`, `FhEmptyState`, shared catalog API, auth store, router, Lucide icons and existing color/font tokens. Service category cards use live active categories, limited to six; links select the existing catalog filter. Loading, empty, failure and retry states are explicit. Reviews, ratings, fabricated statistics, hotline and unsupported warranty promises are omitted.

## Files

- `src/pages/public/LandingPage.vue`: chapter composition, process, trust, questions and final CTA.
- `src/components/landing/`: hero, API catalog, AI illustration and sticky scene shell.
- `src/composables/useLandingStory.ts`: scroll measurement, motion preferences and cleanup.
- `src/layouts/PublicLayout.vue`: responsive public navigation, account links, footer and keyboard handling.
- `src/pages/public/ServicesPage.vue`: category query support.
- `src/router/index.ts`: section anchor scrolling.
- `tests/landing-page.spec.ts`: catalog, retry, category navigation, booking redirect, menu and role regressions.
- `public/images/`: optimized illustration and generation provenance.

## Review

- BA/PM: Customer discovery and booking are primary. AI remains advisory; manual service selection remains available.
- CTO/Tech Lead: Vue, Pinia, router and API ownership preserved. No backend, RBAC, state machine or transaction changes.
- Developer: shared primitives reused; effects are isolated to the landing page. No new packages or environment variables.
- Designer: primary `#2563EB`, Be Vietnam Pro, Space Grotesk chapter numbers, Vietnamese copy, responsive image crops and reduced motion.
- Security: API content uses Vue text escaping; no raw HTML, credentials, private records or new mutations.
- QA: browser testing found and fixed an outside-click issue when the menu icon was replaced during a click. Category states and guarded navigation have automated coverage.
- DevOps: production build succeeds. Existing large shared-bundle warning remains; no Docker or runtime contract changes.

## Validation

- Web lint, typecheck and production build: PASS.
- Full Vitest suite: 45 files, 397 tests PASS, including 10 new landing tests. Existing Google Identity/happy-dom and wallet test log messages remain.
- Chromium local QA: widths 375, 430, 768, 1024 and 1440px; no horizontal overflow, decoded images and loaded Be Vietnam Pro.
- Seven desktop chapters pin at the expected scroll midpoint. Anchor links, booking login redirect, category filtering, mobile menu, Escape/focus restoration, FAQ, reduced motion, short viewport, loading/error/retry/empty states: PASS. No uncaught browser JavaScript errors in these scenarios.
- Browser catalog success cases use intercepted fixtures, explicitly marked as QA data. Fixtures are not shipped in the app. Live catalog integration: NOT VERIFIED; local API was unavailable. Failure handling was checked.
- Docs link and governance checks: PASS. Changed design-system file Markdown lint: PASS. Repository-wide Docs lint: FAIL with 93 existing errors in untouched documents.
- Local browser evidence: `.local/landing-qa/results.json` and screenshots in the same ignored directory. Browser tool had no connected session, so local headless Chromium was used.

## Web/Mobile parity and limits

Inspected Mobile `CustomerHomeScreen.tsx` and `CustomerBookingCreateScreen.tsx`, Web booking wizard, Backend category service, review controller and technician eligibility rules. Both platforms retain manual service selection and advisory AI. Mobile currently has legacy copy such as “AI Soi lỗi”, “Báo giá ngay” and a separate diagnosis screen; it was not redesigned in this task. Native iOS/Android visual parity and live end-to-end booking/AI: NOT VERIFIED.

Public policy pages and downstream customer screens retain their existing layouts. Full WCAG certification, screen-reader/device testing and production performance measurements: NOT VERIFIED. No deployment was performed.
