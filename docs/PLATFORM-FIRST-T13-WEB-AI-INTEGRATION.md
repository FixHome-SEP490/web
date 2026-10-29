# T13 — Tích hợp Web platform-first với AI DEV

2026-10-29 16:49 (UTC+7) · foxonworld · `foxonworld/fixhome-platform-first-web-ai-dev-integration-20261029`.
Chỉ tích hợp/commit cục bộ, sole Web writer. Chưa phát hành.

## Nguồn và merge parents

- Parent 1: `4c38af793debd91b3388e5f4712bc4d5803c1f7a`, Web `origin/dev` sau AI multi-service PR #186.
- Parent 2: `244756b5e3c6e607904ce815c485668924ae2ecb`, platform-first Web T4b + T3c.
- Lệnh: `git merge --no-commit --no-ff 244756b` trên worktree sạch của nhánh T13.
- Chỉ conflict `docs/CONTEXT.md`; không conflict wizard hoặc mã AI. Giữ các phần nội dung platform-first và nội dung AI. Header chính thức và toàn bộ mục 9 của CONTEXT giống parent 1, theo chỉ thị mới nhất của owner giữ nguyên lịch sử đội; thông tin bàn giao mới ở addendum này. Không cắt hoặc viết lại lịch sử để vượt gate.
- Backend chỉ đọc: T8 `e109812`, T9 `d3c885f`, T11 `ee3c236`, sau đó T12 ổn định `432260e39050d514c2e421acb43eb91c9813112b`. Không sửa Backend hoặc DB.

## Thay đổi

- Giữ platform-first customer/technician, SM queue, Admin chỉ đọc và thông báo điều hướng theo case. Giữ hai nguồn interruption-rebook (Manager đóng và onsite), repairFailure, nguồn thiết bị, lịch/giá mới trong luồng sẵn có.
- T8: adapter giữ/kiểm tra `workStopped`, `assignmentReleased`, `operationalDisposition`; khách và lịch sử thợ hiện “Đã dừng công việc” dù enum cũ còn `EN_ROUTE`/`UNDER_REPAIR`. Gate hành động tiến trình và thu mới theo STOP. Khách dừng polling vị trí, bỏ marker/modal, bỏ socket location và phản hồi polling đến muộn; phía thợ dừng location ping và chặn callback vị trí cũ. Luồng custody khai trả vẫn tách khỏi nhận kho.
- T9: giải mã `failedWorkFinance`, không đổi `null` thành 0, không dùng tổng báo giá cũ làm khoản phải trả mới hoặc hứa hoàn tiền. Customer rebook độc lập với tiền/linh kiện cũ. Support detail cho SM/Admin có quyền đọc thông tin đối soát bằng thao tác rõ ràng; chỉ giữ loại chứng từ/ID được allowlist, không chuyển tiếp URL/provider/private fields; không có lệnh tài chính mới.
- T11: form SM trên dòng legacy giữ biên nhận UNKNOWN, hiển thị manual state/version/event; ghi observation bằng command/version, lý do, UUID bằng chứng, số lượng 0–100 có bằng chứng và correction khi sửa kết luận cuối. Giữ đúng lệnh khi retry chưa rõ kết quả; 409 yêu cầu đọc lại. Backend T3 thiếu metadata thì chỉ đọc. Không có accept-return cho legacy hoặc thao tác vật lý Admin.
- T12: Support API/queue/detail giữ `resolutionExecutionKind`, `needsManualAction`, `nextActor`. Ghi nhận kết luận khác với thực thi nghiệp vụ; metadata thiếu không thành execution PASS. Escalation gửi UUIDv4 `commandId` + `expectedVersion`, không gửi amount/liability, nhận `in_review` thực và giữ hold. Retry chưa rõ kết quả giữ nguyên payload; case switch bỏ trạng thái form cũ. Admin vẫn chỉ đọc.
- AI ownership của Toàn được bảo toàn: `AiAssistantWidget.vue`, `composables/aiVisitDraft.ts`, `NewBookingWizardPage.vue` và các test AI giống parent 1 qua `git diff HEAD -- <paths>`. Không sửa logic AI trong bước reconciliation hoặc follow-up.

## Kiểm tra đã chạy

Môi trường Node `v24.15.0`, npm `11.12.1`; `npm ci --no-audit --no-fund` thành công. Cảnh báo dependency deprecation `lucide-vue-next` có sẵn; không đổi dependency/lockfile.

```powershell
npx vitest run tests/ai-visit-draft.spec.ts tests/new-booking-wizard-ui.spec.ts tests/platform-first-customer.spec.ts tests/part-returns.spec.ts tests/t13-web-contracts.spec.ts tests/support-cases-manager-ui.spec.ts
npm run typecheck
git diff --check
```

- PASS: đúng 6 tệp / 132 tests, exit 0. Đã thấy RED cho STOP, metadata/readback T11, T12 ghi nhận/escalation và tracking trước khi sửa. Các lần lặp chỉ dùng cùng bộ sáu tệp.
- PASS: `npm run typecheck`, exit 0.
- PASS: `git diff --check`, exit 0; kiểm tra staged diff trước commit.
- PASS: header và toàn bộ section 9 của CONTEXT được đối chiếu nguyên văn với parent 1; wizard/AI files không có diff so với parent 1.
- T8/T9/T11 được kiểm tra trước khi thêm T12: 5 tệp / 101 tests và typecheck PASS; không dùng test Backend cũ làm bằng chứng Web hiện tại.

## Review và giới hạn

Sole writer tự review kiến trúc Vue/Pinia/Axios, ownership, vai trò, DTO, nguồn liên kết, state/version, retry, response muộn, nội dung tài chính và phạm vi diff. Không có agent/reviewer độc lập. Không đổi route/permission Backend, schema, env, dependency hoặc Docker.

NOT VERIFIED theo phạm vi owner: full suite, lint, build, CI, `context-doc` riêng, browser/visual QA/E2E, Backend live DEV/JWT/socket/DB/warehouse/PSP và Mobile parity. Các tài liệu merge từ nhánh cũ có kết quả gate lịch sử riêng, không phải gate T13. Tests dùng transport mocks, không chứng minh runtime thật hoặc PostgreSQL race. Rebook API/form và các test nhập từ parent 2 ngoài sáu tệp không được chạy lại trong T13.

Không push, PR, merge vào official DEV, deploy, thay DB, chạy browser hoặc dùng agent khác. Khi được phép QA runtime: dùng Backend đã tích hợp/restart tương ứng và hard-refresh Web; không dùng bản source local này làm bằng chứng DEV đã hoạt động.

## Tệp thay đổi so với parent 1

- `docs/CONTEXT.md`
- `docs/PLATFORM-FIRST-T13-WEB-AI-INTEGRATION.md`
- `docs/PLATFORM-FIRST-T3C-WEB-LEGACY-RETURNS.md`
- `docs/PLATFORM-FIRST-T4-WEB-CONTRACT.md`
- `docs/PLATFORM-FIRST-WEB-INTEGRATION-REVIEW.md`
- `src/api/interruption-rebook.api.ts`
- `src/api/orders.api.ts`
- `src/api/part-requests.api.ts`
- `src/api/platform-continuation.api.ts`
- `src/api/stopped-work-finance.api.ts`
- `src/api/support-cases.api.ts`
- `src/components/console/LegacyManualReviewForm.vue`
- `src/components/console/PartReturnsQueue.vue`
- `src/components/console/StoppedWorkFinancePanel.vue`
- `src/components/console/console-navigation.ts`
- `src/components/customer/CustomerContinuationPanel.vue`
- `src/components/customer/InterruptionRebookForm.vue`
- `src/components/notifications/NotificationBellDropdown.vue`
- `src/components/technician/CannotContinueDialog.vue`
- `src/pages/console/SupportDetailPage.vue`
- `src/pages/console/SupportQueuePage.vue`
- `src/pages/console/support-cases.utils.ts`
- `src/pages/customer/CustomerOrderDetailPage.vue`
- `src/pages/technician/TechnicianJobDetailPage.vue`
- `src/router/index.ts`
- `tests/admin-console-routes.spec.ts`
- `tests/console-ui-shell.spec.ts`
- `tests/customer-quotation-approval.spec.ts`
- `tests/interruption-rebook-api.spec.ts`
- `tests/notification-bell-routes.spec.ts`
- `tests/part-returns.spec.ts`
- `tests/parts-return-polish.spec.ts`
- `tests/platform-first-continuation-api.spec.ts`
- `tests/platform-first-customer.spec.ts`
- `tests/platform-first-technician-dialog.spec.ts`
- `tests/platform-first-technician-page.spec.ts`
- `tests/support-cases-manager-ui.spec.ts`
- `tests/support-cases-route.spec.ts`
- `tests/t1-final-polish-parts.spec.ts`
- `tests/t13-web-contracts.spec.ts`
- `tests/technician-order-flow.spec.ts`
