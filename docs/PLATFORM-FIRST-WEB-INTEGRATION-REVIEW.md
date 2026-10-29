# Platform First — Web T4b + T3c integration review

Date: 2026-10-29 (ICT, UTC+7). Local integration only; not released.

## Lineage

- Integration worktree: clean independent worktree for this branch only
- Branch: `foxonworld/fixhome-platform-first-web-integration-20261029`
- Integration base: `6d5098a` (`feat(continuation): offer verified T2 prefilled rebook`)
- T4b source: `foxonworld/fixhome-platform-first-web-tech-customer-t4-20261029` at `6d5098a`
  - `75ed78b` `feat(continuation): record verified interruption for technician and customer`
  - `6d5098a` `feat(continuation): offer verified T2 prefilled rebook`
- T3c source: `foxonworld/fixhome-platform-first-web-legacy-returns-t3c-20261029` at `ce86cdf`
  - `ce86cdf` `feat(console): surface legacy part returns for manual SM verification`
- Merge: local `git merge --no-ff` of `ce86cdf` into `6d5098a`. Both source worktrees were
  checked clean before the merge; neither was written to.

## Conflict resolution

Only `docs/CONTEXT.md` conflicted, in three places:

1. Header timestamp/branch: replaced with the integration branch and the real ICT time.
2. Section 9 top entries: kept both T4b entries (`13:43`, `13:30`) and the T3c entry (`13:57`) in
   newest-first order, then added the integration entry above them.
3. Section 9 tail: kept the already-trimmed T4b list instead of restoring the older
   `2026-10-20 21:31` entry; dropped the two oldest remaining entries so section 9 stays at the
   40-entry limit.

Sections 3 and 5 merged cleanly with both sides' facts kept: the T4/T4b interruption and
prefilled-rebook behaviour, the T3c SM legacy review group, and the T3b/T3c
`GET /part-returns/legacy-manual-review` contract. Section 8 now also records this integration's
verification state. `tests/context-doc.spec.ts` passes.

Merge changes outside docs: `src/api/part-requests.api.ts`,
`src/components/console/PartReturnsQueue.vue`, `tests/part-returns.spec.ts`,
`tests/parts-return-polish.spec.ts`, `tests/t1-final-polish-parts.spec.ts`,
`tests/admin-console-routes.spec.ts`, plus the new
`docs/PLATFORM-FIRST-T3C-WEB-LEGACY-RETURNS.md`.

## Verification

Environment: local clean worktree, Node `v24.15.0`, npm `11.12.1`, `npm ci` run (the worktree had
no `node_modules`). No shared database, migration, deployment or Backend/Mobile repository was
touched.

| Gate | Result |
| --- | --- |
| `npx vitest run tests/context-doc.spec.ts` | PASS — 1 file / 2 tests |
| Focused continuation, rebook, legacy part-return, Admin route and notification suites | PASS — 15 files / 202 tests |
| `npm test` | PASS — 198 files / 2022 tests |
| `npm run lint` | PASS — 0 warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS — no whitespace errors |

Focused files: `platform-first-customer`, `platform-first-continuation-api`,
`platform-first-technician-dialog`, `platform-first-technician-page`,
`interruption-rebook-api`, `interruption-rebook-form`, `customer-cancelled-rebook-action`,
`customer-rebook-routing`, `rebook-and-sessions`, `part-returns`, `parts-return-polish`,
`t1-final-polish-parts`, `admin-console-routes`, `notification-bell-routes`, `notifications`.

## Reviewer checklist

- No user-supplied server path navigation: continuation reads use a fixed service-order path; the
  prefilled CTA sends only the verified source `bookingId` to the existing local wizard. T3c uses a
  fixed legacy path with bounded integers and rejects mismatched payloads.
- Source prefill is gated on `eligible`, `prefilledRebookAvailable`, exact T2 draft/confirmation
  paths for the viewed booking, and matching source order/booking/group. The read itself is an
  authenticated Backend call; ownership remains server-authoritative.
- Legacy part returns are `SERVICE_MANAGER` only, read-only, labelled `UNKNOWN`, and have no accept,
  declaration or discrepancy action. `403/404/501/503` hides only this group.
- Tracked custody return declarations and manual `accept-return` operations are unchanged; the
  existing `part-returns` and polish suites still pass.
- Admin support remains read-only, and support-case notifications keep routing through the case ID
  route (`support-detail`) rather than an order ID; route and notification suites pass.
- Case ID route and Admin read-only behaviour are unchanged by this merge.

Known non-blocking observation: the full test log still contains a pre-existing T4b Vue prop
warning for `CustomerContinuationPanel` when `bookingId` is `null` in
`customer-order-no-acceptance.spec.ts`. It does not fail a test and was not changed in this
integration-only task.

## Status

- Merge and review are local. Nothing was pushed, no PR was opened, and nothing was merged into
  official DEV, deploy, migrations or production.
- No Business feature was added; the task only integrated the two Web slices and resolved context.
- Signed-in E2E, Browser QA, shared Backend DEV runtime, Socket.IO delivery and Mobile parity:
  NOT RUN / NOT VERIFIED.
- Full integration is not released; a separate owner-approved release step is still required.
