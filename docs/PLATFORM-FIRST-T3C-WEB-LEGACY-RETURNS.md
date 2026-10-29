# Platform First T3c — Web legacy part returns

## Scope

This Web slice adds the Service Manager (SM) read-only review of FixHome parts
handed over before custody enrollment. It covers only the console screen and its
API client, tests and this context. Customer, technician, booking, Admin support,
Backend, Mobile, AI and shared DEV data are out of scope.

The page is `/console/part-returns`, route `console-part-returns`, restricted to
`SERVICE_MANAGER` in `src/router/index.ts`. Backend authorization remains the
source of truth.

## Backend contract (T3b)

Source checked read-only in the Backend worktree
`fixhome-platform-first-parts-t3-20261029` at commit `01ab9cc`:

- `GET /part-returns/legacy-manual-review`
- `@Roles(Role.SERVICE_MANAGER)`
- Query `PageSizeQueryDto`: `page` 1..1,000,000 (default 1), `pageSize` 1..100
  (default 20).
- Response `{ data: LegacyManualReviewRecord[], meta: { total, page, pageSize } }`.
- Record fields: `kind: 'legacy_manual_review'`, `receiptState: 'UNKNOWN'`,
  `orderId`, `partRequestId`, `partRequestItemId`, `technicianId`, `requestType`,
  `requestStatus`, `handedOverAt`, nullable `partCatalogId`, `partNameSnapshot`,
  `issuedQty`.
- The query is an anti-join against the custody ledger and only reads rows. No
  order, request or ledger row is written, and there is no accept, declaration or
  discrepancy command for legacy rows.

`issuedQty` is the factual quantity issued at handover. It is not outstanding,
returned or accepted stock.

## Web behaviour

`src/api/part-requests.api.ts` adds the typed `LegacyManualReviewRecord`,
`LegacyManualReviewPage` and `getLegacyManualReview`. The fixed path is separate
from every write endpoint. Pagination values are bounded integers, so caller
input cannot alter the endpoint or inject a query. The response is validated:
UUID-shaped identifiers, known request type/status, ISO handover time, a positive
issued quantity, exactly `kind: 'legacy_manual_review'` and
`receiptState: 'UNKNOWN'`, and `meta` matching the requested page. Any mismatch
throws `LegacyManualReviewPayloadError`; the screen then shows an error rather
than inventing a row.

`src/components/console/PartReturnsQueue.vue` renders a separate group, "Linh
kiện lịch sử cần xác minh", only when the account can act as SM. Each row shows
the part name, the part-request reference, an order link, the technician
reference, handover time, the label "Số lượng đã cấp theo lịch sử", and the
neutral badge "Chưa xác định (UNKNOWN)". An orange alert states that there is no
custody document and that SM must verify by hand. The group never shows accepted,
remaining or declared quantities and has no accept or discrepancy button.

Loading, empty and error states are independent of the tracked return queue.
HTTP 403/404/501/503 hides only the legacy group; any other error leaves the
tracked queue usable and offers an explicit retry. A legacy failure never hides
valid tracked rows. The tracked queue keeps its full/partial/discrepancy
behaviour. Its empty state now says that an empty tracked queue means it contains
only custody-ledger rows, not that every part was returned.

## Verification

Focused tests are in `tests/part-returns.spec.ts` and cover the T3b mapping,
bounded pagination, malformed payload rejection, empty page, legacy list
rendering, the missing legacy actions, 403/503 hiding only the legacy group,
generic-error retry, server pagination, the empty state and the non-SM guard.
`tests/admin-console-routes.spec.ts` asserts the route stays SM-only.
`tests/parts-return-polish.spec.ts` and `tests/t1-final-polish-parts.spec.ts` keep the
tracked queue regression mocks current.

Runtime with a signed-in SM, Browser E2E, shared DEV Backend and Mobile parity are
not verified in this slice.
