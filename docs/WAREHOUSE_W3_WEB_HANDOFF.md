# W3 Web handoff — read-only shipping and Admin DRAFT/preview

Date: 05/11/2026. Status: **SOURCE REVIEWED; WEB GATE BLOCKED; NOT FINANCIALLY ACTIVATED**.

The original shipping scaffold prepares typed optional read fields and read-only rendering; that slice is unchanged. The new Admin slice below calls only B3a DRAFT/preview APIs. When policy fields are absent, Web keeps the legacy full-shipping display. W3 appears only when an existing server read supplies `shippingPolicyVersion: W3_70_30_V1`, a valid integer `shippingFee` S, and both authoritative shares: `customerShippingShare = floor((7*S + 5)/10)` and `technicianShippingShare = S - customerShippingShare`. Invalid or incomplete W3 snapshots show an error and no split. The browser never calculates the split, payment, approval, or dispatch authority.

Pickup remains free. A technician net-labor line is shown only when the server read supplies a valid `technicianNetLabor`; Web does not derive it. No consent, payment, approval, courier-booking, or dispatch status is represented by this scaffold.

## Existing API behavior and future contract gates

The backend reference is `docs/WAREHOUSE_W3_FINANCE_CONTRACT.md` in the W3 backend worktree. Section 14 implements the Admin source-only contract; operational delivery routes below remain proposals. Web does not call these proposed operational routes. Until the backend adds the policy snapshot to an already-existing shipping read or publishes a reviewed read contract, those screens remain on legacy copy.

The draft proposes these routes under `/api/v1/part-requests/:id/delivery`:

| Route | Draft actor | Draft purpose | Web gate |
| --- | --- | --- | --- |
| `GET /` | Owning customer, active technician, assigned warehouse SM | Read policy, quote version, S/c/t, consent status | Before any W3 UI depends on a delivery-specific read, backend must publish and implement the stable response and access rules. |
| `POST /proposal` | Active SM for the warehouse | Submit courier quote/evidence and S | No Web call until backend, Finance, and owner approve the command contract. |
| `POST /consent` | Owning customer or active technician, separate receipts | Explicit acceptance bound to proposal/version | No Web consent UI until each actor's receipt, version binding, expiry/revocation, and retry behavior are implemented and reviewed. |
| `POST /actual` | Active SM for the warehouse | Record actual S/evidence | No Web call until the actual-cost and consent invalidation rules are live and reviewed. |
| `POST /dispatch` | Active SM for the warehouse | Record manual booking reference/evidence | No Web call until server dispatch gates, custody evidence, and race handling are live and reviewed. |

Before implementation of any operational delivery mutation, the backend/Finance/owner gate must confirm: authenticated actor and ownership/RBAC; immutable integer VND snapshot; exact W3 ratio and source cost; dual explicit consent bound to the same proposal/version; technician net labor after all approved deductions and aggregate W3 shares; invoice/payment/cancel race checks; idempotent command receipts; refund/cancel rules; and W2 custody evidence. The draft specifically requires command ID, expected version, payload fingerprint, order/allocation locking, retry-safe receipt, and server-side rejection of mismatched retries. These checks remain backend authority.

Finance signoff is **not complete**. W3 must not be financially activated, deployed, or inferred from a positive shipping fee. No migration, environment switch, shared database write, or Mobile/AI change is part of this Web scaffold.

## Owner preview: copy comparison

| Surface | Current legacy copy when policy fields are absent | Preview copy only for a valid authoritative W3 snapshot |
| --- | --- | --- |
| Customer order / visit additional cost | `Phí giao linh kiện` — full S | `Phần khách hàng (70%)` — c; `Phần kỹ thuật viên (30%)` — t |
| Technician part request | `Phí giao hàng` — full S | Both customer and technician shares; show `Tiền công thực nhận sau phí giao` only if supplied by server |
| SM part request detail | `Tổng phí giao hàng` — full S | `Tổng phí giao thực tế` — full courier S |
| Pickup | No shipping charge | Still free; W3 breakdown is hidden |
| Incomplete/inconsistent W3 snapshot | Not applicable to legacy data | Error copy: `Chưa thể đối chiếu phần phí giao hàng theo chính sách W3.`; do not render either share |

The current component does not add approval, consent, payment, or dispatch badges. The customer and technician see shares as a breakdown only; it does not indicate consent or an amount collected.

## Verification

### Admin DRAFT/preview integration (05/11/2026)

- Before: no dedicated Admin policy screen; generic AdminConfig and operational shipping remain separate. After: `/console/admin/w3-delivery-policy`, Admin-only navigation `Cấu hình giao hàng` (trang vẫn ghi rõ trạng thái bản nháp), route permission `config:read`; saves use the existing permission helper and Backend `config:update` remains authoritative.
- Source contract checked against Backend B3a controller, DTO, service, store, canonical fingerprint and impact preview. Calls are limited to `GET /current`, `GET /history`, `POST /drafts`, `PATCH /drafts/:id`, `POST /preview` under `/admin/w3-delivery-policy`. History is available through the typed adapter; no history UI added. No activation/retirement, consent, dispatch, payment, ledger or shipping approval action.
- Adapter checks standard success envelope, all six typed blockers, inert mode, blocked finance, null effective policy, exact DRAFT snapshot shape, safe integer parameters, revision/content version, policy ID and canonical SHA-256 content fingerprint. Mutation responses must confirm expected revision and parameters; PATCH must return a new snapshot ID. Fingerprint is content identity, not approval evidence.
- Parameters start blank without a draft. Ngưỡng xem xét phí giao is a review ceiling, never an approved actual fee. One manually entered hypothetical sample is submitted to the server; shares and review flags are rendered from that response without a client-side financial formula. Empty courier evidence age is explicit null, never verified evidence.
- Saves and previews prevent duplicates; changed inputs discard preview. Unknown mutation results require explicit reload, not automatic retry. HTTP 409 retains input and blocks further actions until reload (which replaces input). HTTP 404/503 hides forms and shows `NOT_AVAILABLE`. Invalid payloads fail closed and cannot show mutation success.
- RED stubs: 13 failures, then 35 GREEN; independent READ_ONLY review identified failure-envelope and nullable-evidence mismatches. Both received RED tests and fixes; reviewer reran **62/62 PASS** across W3 Admin, shipping and Admin routes with no remaining source blocker.
- Chromium local fixture QA at **360/768/1440 px**: initial empty state, save ACK, manual preview, unknown evidence label, changed-input invalidation, conflict retention/disabled save, explicit 404/503 hiding, Tab focus and reduced motion; no horizontal overflow or page JS errors observed. Screenshots in OS temporary directory. Expected 409/404/503 console resource errors were observed; two category connection errors occurred on the public page before API interception. This is mocked UI verification, not live JWT/HTTP/DB proof or owner approval.
- Lead phát hiện test `tests/console-ui-shell.spec.ts` quy định nhãn menu tối đa 20 ký tự, không có ngoặc. Đã rút ngắn nhãn menu thành `Cấu hình giao hàng` và giữ nhãn Bản nháp trong tiêu đề trang; không sửa hoặc nới test. Test console shell PASS 16/16.
- Final verification on Node **24.15.0**: `npm run lint`, `npm run typecheck`, `npm run build` **PASS** (build retains the existing large-chunk warning). `npx vitest run tests/w3-delivery-policy.spec.ts tests/shipping-policy.spec.ts tests/admin-console-routes.spec.ts tests/context-doc.spec.ts`: **64/64 PASS**. `npm test -- --maxWorkers=4` đã chạy lại sau chỉnh nhãn: **2446 PASS / 0 FAIL**, 219 passing files, với một số log lỗi kết nối localhost:3000 được test xử lý và không gây fail. `git diff --check`, exact seven-file allowlist manifest và context log **PASS**. Lead chạy lại focused W3 + console shell + Admin routes + context: **65/65 PASS**; typecheck/lint/build PASS. Chưa có server/API thật hoặc database migration được xác minh. Local QA server stopped and fixture session removed.
- Backend/DEV deployment, migration `1793466000006`, PostgreSQL transaction/RLS/grants, signed-in HTTP integration, legal/accounting/warehouse/courier/Finance signoff and owner before/after review: **NOT VERIFIED**. No Mobile/AI work. No stage/commit/push/merge/deploy/migration/seed/DB write. Lead must finish source/schema safety and owner review before any rollout; restart Backend and hard-refresh Web after an independently approved release.

- `tests/shipping-policy.spec.ts`: focused helper and component coverage for missing fields → legacy, 20,000 → 14,000 + 6,000, half-up rounding, invalid ratio, missing/invalid shares, safe integer and numeric-string validation, role-specific display, pickup, optional technician net labor, and no approval/payment copy.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` results are recorded in the lead review report/context entry. A passing local build or pure test does not prove backend response wiring, browser behavior against W3, Finance approval, or live activation.
