# W3 Web handoff — read-only scaffold

Date: 04/11/2026. Status: **READY FOR LEAD REVIEW; NOT FINANCIALLY ACTIVATED**.

This Web change only prepares typed optional read fields and read-only rendering. Existing API URLs and payload behavior are unchanged. When policy fields are absent, Web keeps the legacy full-shipping display. W3 appears only when an existing server read supplies `shippingPolicyVersion: W3_70_30_V1`, a valid integer `shippingFee` S, and both authoritative shares: `customerShippingShare = floor((7*S + 5)/10)` and `technicianShippingShare = S - customerShippingShare`. Invalid or incomplete W3 snapshots show an error and no split. The browser never calculates the split, payment, approval, or dispatch authority.

Pickup remains free. A technician net-labor line is shown only when the server read supplies a valid `technicianNetLabor`; Web does not derive it. No consent, payment, approval, courier-booking, or dispatch status is represented by this scaffold.

## Existing API behavior and future contract gates

The backend reference is `docs/WAREHOUSE_W3_FINANCE_CONTRACT.md` in the W3 backend worktree. It is a draft, not an active endpoint contract. This Web scaffold does not call any proposed route. Until the backend adds the policy snapshot to an already-existing read or publishes a reviewed read contract, these screens remain on legacy copy.

The draft proposes these routes under `/api/v1/part-requests/:id/delivery`:

| Route | Draft actor | Draft purpose | Web gate |
| --- | --- | --- | --- |
| `GET /` | Owning customer, active technician, assigned warehouse SM | Read policy, quote version, S/c/t, consent status | Before any W3 UI depends on a delivery-specific read, backend must publish and implement the stable response and access rules. |
| `POST /proposal` | Active SM for the warehouse | Submit courier quote/evidence and S | No Web call until backend, Finance, and owner approve the command contract. |
| `POST /consent` | Owning customer or active technician, separate receipts | Explicit acceptance bound to proposal/version | No Web consent UI until each actor's receipt, version binding, expiry/revocation, and retry behavior are implemented and reviewed. |
| `POST /actual` | Active SM for the warehouse | Record actual S/evidence | No Web call until the actual-cost and consent invalidation rules are live and reviewed. |
| `POST /dispatch` | Active SM for the warehouse | Record manual booking reference/evidence | No Web call until server dispatch gates, custody evidence, and race handling are live and reviewed. |

Before implementation of any mutation, the backend/Finance/owner gate must confirm: authenticated actor and ownership/RBAC; immutable integer VND snapshot; exact W3 ratio and source cost; dual explicit consent bound to the same proposal/version; technician net labor after all approved deductions and aggregate W3 shares; invoice/payment/cancel race checks; idempotent command receipts; refund/cancel rules; and W2 custody evidence. The draft specifically requires command ID, expected version, payload fingerprint, order/allocation locking, retry-safe receipt, and server-side rejection of mismatched retries. These checks remain backend authority.

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

- `tests/shipping-policy.spec.ts`: focused helper and component coverage for missing fields → legacy, 20,000 → 14,000 + 6,000, half-up rounding, invalid ratio, missing/invalid shares, safe integer and numeric-string validation, role-specific display, pickup, optional technician net labor, and no approval/payment copy.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` results are recorded in the lead review report/context entry. A passing local build or pure test does not prove backend response wiring, browser behavior against W3, Finance approval, or live activation.
