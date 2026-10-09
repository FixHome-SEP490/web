# Context repo web — FixHome

> Cập nhật lần cuối: 2026-10-10 01:09 (UTC+7) · Người cập nhật (git): ToanAltF4 · Nhánh: feat/tech-step-details-ai-summary

## 0. Quy tắc cập nhật file này (bắt buộc)

File này là nguồn ngữ cảnh chung của repo cho cả dev lẫn AI agent. Đọc trước khi làm bất kỳ việc gì trong repo. Bốn repo `ai-service`, `backend`, `web`, `mobile` dùng chung một bộ quy tắc này; test `tests/context-doc.spec.ts` kiểm tra định dạng mỗi lần chạy `npm test` và trong CI, sai quy tắc là CI đỏ.

### Khi nào phải cập nhật

Cập nhật trong cùng PR với thay đổi, không để PR sau. Bắt buộc khi PR làm thay đổi một trong các thứ sau:

1. Tính năng hoặc luồng nghiệp vụ người dùng thấy được.
2. API, sự kiện realtime, enum, schema gửi qua lại giữa các repo.
3. Biến môi trường, cổng, cách chạy, cổng kiểm thử (gate), CI, Docker.
4. Migration hoặc cấu trúc dữ liệu.
5. Quyết định của PO hoặc luật nghiệp vụ.
6. Việc đang dở, rủi ro mới phát hiện, hoặc một mục ở phần 8 đã xong.

Sửa lỗi không đổi hành vi bên ngoài thì không bắt buộc. Không chắc thì cập nhật.

### Cách cập nhật

1. Sửa nội dung mục 1 đến 8 cho đúng hiện trạng. Viết lại câu cũ cho đúng, không chồng thêm ghi chú lên câu đã sai.
2. Sửa dòng `> Cập nhật lần cuối:` ở đầu file theo đúng mẫu:
   `> Cập nhật lần cuối: YYYY-MM-DD HH:mm (UTC+7) · Người cập nhật (git): <git user.name> · Nhánh: <nhánh>`
   Giờ là giờ Việt Nam lúc sửa, lấy bằng lệnh dưới đây (chạy được trên Windows, macOS, Linux; đừng dùng `TZ=... date` vì Git Bash trên Windows lặng lẽ trả giờ UTC):
   `node -e "console.log(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()))"`
   hoặc `python -c "from datetime import datetime,timezone,timedelta;print(datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M'))"`.
   Tên lấy đúng chữ từ `git config user.name`. Nhánh lấy từ `git branch --show-current`.
3. Thêm một dòng lên đầu mục 9, cùng giờ và cùng tên với dòng đầu file:
   `- YYYY-MM-DD HH:mm (UTC+7) | <git user.name> | <nhánh hoặc PR #số> | <đã đổi gì trong context, một câu>`
4. Chạy `npx vitest run tests/context-doc.spec.ts` trước khi commit.

### Viết gì và không viết gì

- Chỉ ghi điều đã kiểm chứng trong code, PR hoặc lần chạy thật. Điều chưa kiểm chứng ghi rõ `CHƯA KIỂM CHỨNG`.
- Repo là public. Tuyệt đối không ghi mật khẩu, khoá API, token, chuỗi kết nối có mật khẩu, địa chỉ IP máy chủ hay máy GPU, dữ liệu khách hàng. Biến môi trường chỉ ghi tên, không ghi giá trị. Test chặn các mẫu này.
- Không ghi ý kiến cá nhân, việc vặt, nhật ký làm việc hằng ngày, hay chỗ trống kiểu "để sau". Việc chưa làm ghi ở mục 8 với tên việc cụ thể.
- Không chép lại tài liệu khác; dẫn đường dẫn tới file đó.
- Tiếng Việt, câu ngắn. Tên kỹ thuật, tên file, tên API giữ nguyên tiếng Anh, đặt trong backtick.
- Không đổi tên, không xoá, không đổi thứ tự mười tiêu đề `##` số 0 đến 9; nội dung con dùng `###`. Không thêm tiêu đề `##` khác.
- Mục 9 mới nhất ở trên cùng, giữ tối đa 40 dòng; dòng cũ hơn thì xoá, lịch sử đã có trong git.
- File dài tối đa 700 dòng. Dài hơn thì rút gọn và dẫn link.

### Khi thay đổi chạm nhiều repo

Hợp đồng giữa các repo (mục 2 và mục 5) phải khớp nhau. Đổi API ở `backend` thì cập nhật context của `web`, `mobile` (và `ai-service` nếu liên quan) trong PR của từng repo đó, cùng ngày. Mục 2 của bốn repo giống nhau; sửa ở một repo thì sửa cả bốn.

### Với AI agent

Đọc file này trước, rồi `AGENTS.md`, rồi `docs/AI-TECHNICAL-GUIDE.md`. Không tạo file ngữ cảnh khác thay cho file này. Khi kết thúc việc, áp dụng đúng mục "Cách cập nhật" ở trên với tên git của máy đang chạy.

## 1. Repo này là gì trong FixHome

`web` là ứng dụng Vue 3 + Vite + Pinia + Tailwind v4, phục vụ cả bốn vai trò của FixHome: trang công khai, khách hàng (`/app`), kỹ thuật viên (`/tech`), và khu `/console` cho quản lý dịch vụ và admin. Mọi dữ liệu và nghiệp vụ đi qua `backend`; web không gọi thẳng `ai-service`, database hay cổng thanh toán. Cổng dev 5173.

## 2. Liên kết với các repo khác

FixHome gồm năm repo trong tổ chức GitHub `FixHome-SEP490`. Bốn repo mã nguồn có file context cùng cấu trúc:

| Repo | Vai trò | Nhánh tích hợp | Context |
| --- | --- | --- | --- |
| `backend` | NestJS, nguồn sự thật về nghiệp vụ, quyền và dữ liệu | `dev` | `https://github.com/FixHome-SEP490/backend/blob/dev/docs/CONTEXT.md` |
| `web` | Vue cho cả bốn vai trò; khu `/console` cho quản lý dịch vụ và admin | `dev` | `https://github.com/FixHome-SEP490/web/blob/dev/docs/CONTEXT.md` |
| `mobile` | Expo / React Native cho khách hàng và kỹ thuật viên | `dev` | `https://github.com/FixHome-SEP490/mobile/blob/dev/docs/CONTEXT.md` |
| `ai-service` | FastAPI, chẩn đoán từ ảnh và mô tả, chatbot tư vấn; chỉ mang tính gợi ý | `main` | `https://github.com/FixHome-SEP490/ai-service/blob/main/docs/CONTEXT.md` |
| `docs` | Tài liệu dự án | — | — |

Luồng gọi giữa các repo:

```text
web  ──┐  REST /api/v1 + Socket.IO (JWT)
       ├──────────────────────────────▶ backend ──HTTP──▶ ai-service (/api/v1/diagnosis/analyze, /api/v1/chat/ask)
mobile ┘                                   │
                                           ├──▶ Supabase PostgreSQL (TypeORM, migration); Supabase Storage (riêng ảnh KYC)
                                           ├──▶ Cloudinary (ảnh đại diện, ảnh booking, ảnh bằng chứng sửa chữa)
                                           ├──▶ VNPay (thanh toán hoá đơn, nạp ví) và payOS (chi tiền rút ví)
                                           ├──▶ MapTiler (gợi ý địa chỉ, đổi toạ độ ra địa chỉ)
                                           └──▶ Google OAuth (đăng nhập Google), SMTP (gửi OTP)
```

`web` hiển thị bản đồ bằng MapTiler; `mobile` dùng `react-native-maps`. Chat và gọi thoại dùng chung Socket.IO namespace `/chat` của `backend`; thông báo hiện chỉ đọc qua REST (chưa có đẩy realtime hay push).

Ba điều không đổi giữa các repo:

1. `web` và `mobile` không gọi thẳng `ai-service`, database hay cổng thanh toán; mọi thứ đi qua `backend`.
2. `backend` là nơi quyết định nghiệp vụ và phân quyền; kiểm tra phía client chỉ để trải nghiệm.
3. `ai-service` chỉ gợi ý. AI hỏng hoặc chậm không được chặn luồng đặt lịch; `backend` trả kết quả dự phòng.

Luật nghiệp vụ gốc nằm ở tài liệu dự án (bản chính thức của nhóm). Mâu thuẫn giữa code và tài liệu thì ghi vào mục 8 và hỏi PO, không tự quyết.

## 3. Trạng thái hiện tại

Trang công việc của thợ (PO 10/10/2026): trong danh sách 5 bước (sau "Xem thêm") bấm từng bước đã làm để xem chi tiết (giờ xuất phát theo `timeline`, check-in và ảnh trước sửa, báo giá và trạng thái duyệt hoặc giá cố định, giờ hoàn thành và ảnh sau sửa, tổng tiền và tình trạng thanh toán). Hiện "Khách mô tả" (mô tả của booking, trước đây không hiện). Booking đặt qua AI (`booking.aiSummary` có giá trị) có nút "Xem tóm tắt vấn đề từ AI" mở `components/technician/AiSummaryDialog.vue`: lời khách, ảnh khách gửi, AI nhận định (thiết bị, có thể là, đã khuyên khách, giá tham khảo, dịch vụ gợi ý, kết luận) và ghi chú gợi ý sơ bộ. Hội thoại đầy đủ khách-AI chưa có (backend chỉ lưu bản tóm tắt). Hai form đặt lịch dùng chung `NewBookingWizardPage`: `router-view` của khu khách gắn `key` bằng `utils/booking-form-key.ts` để chuyển giữa "Đặt thợ ngay" và "Chẩn đoán bằng AI" thì dựng lại đúng form.

### Khách hàng (`/app`)

- Hai form đặt lịch trên cùng trang `NewBookingWizardPage.vue`: `/app/bookings/new` khách tự chọn dịch vụ, không có AI; `/app/bookings/ai` khách mô tả và gửi tối đa 3 ảnh, trò chuyện với AI, AI gợi ý dịch vụ và khách được đổi. AI lỗi không chặn đặt lịch.
- Chọn 1 đến 2 kỹ thuật viên ở trang ứng viên, theo dõi booking, huỷ, đổi lịch, gia hạn tìm thợ.
- Đơn sửa chữa: duyệt hoặc từ chối báo giá và chi phí phát sinh, xem hoá đơn, thanh toán VNPay hoặc tiền mặt, xác nhận hoàn tất, xem bằng chứng, bảo hành và yêu cầu bảo hành, đánh giá kỹ thuật viên, khiếu nại.
- Lịch sử sửa chữa (trong menu avatar), hồ sơ và sổ địa chỉ (gợi ý địa chỉ qua `backend`), thông báo.
- Bong bóng trợ lý AI (`AiAssistantWidget`) chuyển cuộc trò chuyện sang `/app/bookings/ai?aiSession=...`. Bong bóng chat với kỹ thuật viên (`ChatFloatingWidget`) kèm gọi thoại WebRTC, có ở mọi trang của khách và kỹ thuật viên.

### Header thống nhất và landing (PO 09/10/2026, nhánh `feat/unified-header-landing`)

- Menu tài khoản (avatar) dùng chung `components/account/AccountMenu.vue` cho trang công khai (`PublicLayout`) và khu khách (`CustomerLayout`); mục theo vai trò lấy từ `utils/account-menu.ts`. Menu chỉ có mục tài khoản, không còn danh sách dịch vụ hay mục "Tài khoản" dẫn về trang tổng quan đầy dịch vụ.
- Khu khách: "Lịch sử sửa chữa" rời thanh trên vào menu avatar (thanh trên còn Tổng quan, Đơn sửa chữa, Bảo hành, Tin nhắn). Mục "Sổ địa chỉ" trùng link với "Hồ sơ cá nhân" nên gộp vào đó.
- Trang công khai: mỗi vai trò chỉ khác một nút ở header: khách "Đặt thợ ngay", kỹ thuật viên "Vào trang thợ", quản lý dịch vụ và admin "Vào trang quản lý"; trên điện thoại nút này nằm đầu menu avatar. Menu ba gạch chỉ còn điều hướng trang. Cột "Tài khoản" ở footer dẫn khách tới "Đơn của tôi".
- Landing xếp lại theo thứ tự: hero, dịch vụ, AI, cách hoạt động, vì sao tin, ứng dụng, câu hỏi, lời kêu gọi cuối; nav header cùng thứ tự. Rút gọn chữ, bỏ dòng lặp và các nhãn nổi có số liệu chưa kiểm chứng ("Độ chính xác cao", "100% thợ xác minh", "bán kính 1-2km", "tối đa 5 ảnh"). Không đổi màu, font hay style.

### Kỹ thuật viên (`/tech`)

Onboarding và KYC, bật tắt nhận việc (cần đủ số dư ví), lời mời (nhận hoặc từ chối), danh sách và chi tiết công việc (đi đến, check-in GPS, bắt đầu sửa, ảnh trước và sau, báo giá, chi phí phát sinh, linh kiện, khai tiền mặt, huỷ), bảo hành, thu nhập, ví (nạp qua VNPay, tài khoản ngân hàng, rút tiền qua payOS), hồ sơ (kỹ năng và giá công, lịch, ngày nghỉ, đánh giá).

### Console (`/console`)

- Cả quản lý dịch vụ và admin: tổng quan, đơn, booking (gán thợ thủ công), yêu cầu linh kiện, ví và rút tiền, khu vực phục vụ.
- Chỉ quản lý dịch vụ: huỷ đơn, vi phạm, hỗ trợ và tranh chấp (kể cả tiền mặt), bảo hành.
- Chỉ admin: kỹ thuật viên và duyệt KYC, danh mục dịch vụ, duyệt kỹ năng, người dùng, cấu hình hệ thống, linh kiện, công nợ nền tảng, nhật ký audit.

### Giao diện console làm lại (10/10/2026, nhánh `feat/console-ui-redesign`)

Theo luật UI của PO ngày 10/10/2026, giữ nguyên màu, font, API và `data-testid`. Thành phần dùng chung ở `src/components/console/`: `ConsolePageHeader` (tiêu đề trái, tối đa một nút chính và menu "⋯" `ConsoleMoreMenu`/`ConsoleMenuItem` bên phải), `ConsoleTable` (bảng gọn, cột phụ ẩn bớt ở màn hẹp bằng `hideBelow` để 1024 px không cuộn ngang, skeleton `ConsoleTableSkeleton` khi tải), `ConsoleLoadError` (chỉ "Chưa tải được, vui lòng thử lại." và nút "Thử lại"; câu tiếng Việt rõ nghĩa của server qua `userFacingError` được giữ), `ConsoleTabs`, `ConsolePagination`, `ConsoleSearch`, lớp CSS chung `console-ui.ts`, nhãn tiếng Việt cho mã ở `console-labels.ts` và `audit-labels.ts`, khung ngữ cảnh case `SupportCaseContext`. Menu bên (`console-navigation.ts`) chia nhóm theo vai trò, mỗi trang một lần, nhãn ngắn; tiêu đề route console bỏ tiếng Anh và tab trình duyệt theo mẫu "{Tiêu đề} | FixHome". Tổng quan còn một hàng số liệu và danh sách "Cần xử lý" (mục dẫn sang trang chỉ dành cho quản lý dịch vụ thì admin chỉ thấy số). Mọi trang danh sách dùng bảng thay chồng thẻ, bỏ đoạn giải thích dài, bỏ hiện UUID, mã enum, mã lỗi cổng thanh toán và chữ "Backend"; trang khu vực phục vụ bỏ dữ liệu giả khi lỗi tải. Test `tests/console-ui-shell.spec.ts`.

### Thay đổi 07/10/2026 (nhánh `fix/no-fake-data-and-po-decisions`)

- Bỏ dữ liệu và luồng giả: tài khoản demo ở trang đăng nhập, nút giả lập quét QR, số liệu và khuyến mãi bịa ở trang khách, trang thợ, trang công khai, hotline và địa chỉ bịa, mã QR tải app giả, hoá đơn mẫu, check-in lấy toạ độ nhà khách khi máy không có GPS (giờ chỉ dùng GPS thật), cộng tiền tức thì khi nạp ví.
- Đánh giá: chưa có đánh giá thì hiện "Chưa có đánh giá" (`ratingLabel` trong `utils/formatters.ts`).
- Chẩn đoán AI bắt buộc có mô tả (BRX-064) ở form đặt lịch có AI và bong bóng trợ lý.
- Console: nút "Xác nhận vi phạm" ở trang huỷ đơn; hai khoá `order.departure_*` ở trang cấu hình; banner khi chưa cấu hình payOS.
- Thông báo `ORDER_DEPARTURE_WARNING` (đỏ) và `BOOKING_MATCHING_EXHAUSTED` (vàng, mở trang chọn lại kỹ thuật viên).

### Xử lý tranh chấp tiền mặt (07/10/2026, nhánh `fix/cash-case-resolution`)

Form xử lý case tiền mặt (`SupportDetailPage.vue`) không còn ô gõ tay mã. Chọn "Xác nhận khách đã trả đủ tiền mặt theo hoá đơn" gửi đúng mã `CASH_SETTLEMENT_CONFIRMED_BY_MANAGER` (`cashResolutionCodeLabels` trong `support-cases.utils.ts`), là mã duy nhất backend dùng để chốt tiền và hoàn tất đơn; trước đây gõ mã khác thì case đóng mà đơn kẹt ở đang sửa. Trạng thái "Từ chối" chỉ còn lựa chọn đóng case.

### Miễn vi phạm phải có lý do (07/10/2026, nhánh `fix/strike-waive-reason`)

Bỏ vi phạm thủ công (PO 09/10/2026): huỷ đơn tự trừ điểm uy tín nên trang Huỷ đơn (`ConsoleCancellationsPage.vue`) không còn nút "Xác nhận vi phạm" hay "Miễn Strike", chỉ hiện cột "Điểm uy tín" (`reputationDelta` từ backend: "Trừ 10 điểm uy tín" hoặc "Không trừ điểm") và nút Cấp Boost. Trang Vi phạm (`ConsoleStrikesPage.vue`) đã xoá, mục menu bỏ, `/console/strikes` chuyển sang `/console/reputation`; `ordersApi.getStrikes/waiveStrike` đã bỏ.

Trạng thái nhận việc (PO 08/10/2026, backend #93): dashboard thợ đọc `GET /technicians/me/availability` và hiện "Đang nhận việc, theo lịch tới 17:00", "Ngoài giờ làm, tự nhận việc lại lúc 07:00 T7 10/10", "Tạm nghỉ nhận đơn", "Đang nghỉ tới ..." hoặc "Chưa đặt lịch làm" (`utils/availability.ts`); chấm xanh chỉ khi thật sự đang nhận việc. Nút vẫn là nút tay để tạm nghỉ.

Tra cứu kỹ thuật viên cho admin (PO 08/10/2026, backend #92): trang `/console/admin/technician-directory` (`AdminTechnicianDirectoryPage.vue`, menu "Tra cứu kỹ thuật viên") tìm theo tên (không dấu cũng được), email, SĐT, CCCD, mã tài khoản, không theo địa chỉ; bấm một kết quả để xem đủ: tài khoản (CCCD, ngày sinh, mã), điểm uy tín, số dư ví, hồ sơ nghề, kỹ năng, lịch tuần, khu vực, đơn theo trạng thái và gần nhất, thay đổi điểm. API ở `api/admin-technicians.api.ts`.

Yêu cầu đổi thợ (PO 08/10/2026, backend #91): trang chi tiết khiếu nại của SM, với case `technician_replacement` còn mở, có khung `components/console/TechnicianReplacementPanel.vue`: danh sách thợ phù hợp của booking (bỏ thợ đã báo; case mở chỉ với đơn thì lấy booking từ đơn), chọn thợ + lý do -> `POST /service-orders/:id/replace-technician`; hoặc "Huỷ đơn, không trừ điểm" (huỷ đơn bằng quyền SM rồi đóng case `order_cancelled_no_fee`). Báo giá đã duyệt thì backend từ chối đổi, câu lỗi hiện nguyên văn. Tổng quan vận hành (PO 09/10/2026, `ConsoleDashboard.vue`) có hai dòng trong danh sách "Cần xử lý": "Cần thay đổi thợ" (`openReplacementCases`, link `/console/support?caseType=technician_replacement&status=open`) và "Đơn tự huỷ vì thợ không xuất phát" trong 7 ngày (`noDepartureCancellations7d`, link `/console/cancellations`). Trang khiếu nại nhận `caseType`/`status` từ query (bỏ qua giá trị lạ) và bộ lọc loại có thêm "Cần thay đổi thợ".

Ví khách (PO 08/10/2026, backend #90): trang `/app/wallet` (`CustomerWalletPage.vue`, mục "Ví của tôi" trong menu tài khoản) hiện số dư, nạp qua VNPay (10.000 - 50.000.000 ₫, trang trả về `?payment=success|failed&amount=`), lịch sử nạp/thanh toán/hoàn tiền; ghi rõ không rút được. Hộp thanh toán ở chi tiết đơn có "Trả bằng ví" (đọc số dư khi mở, thiếu thì gợi ý nạp thêm) bên cạnh VNPay; trả xong báo ngay rồi tải lại đơn ngầm (`loadOrder(true)`). Trang khiếu nại của SM có kết quả "Hoàn tiền vào ví khách" (`refund_to_wallet`), bắt nhập số tiền và chỉ dùng khi Đã giải quyết; từ 09/10/2026 lựa chọn này chỉ hiện với khiếu nại linh kiện (`parts_dispute`) và bảo hành (`warranty_dispute`) (`REFUND_CASE_TYPES` trong `support-cases.utils.ts`, khớp backend), bên chịu tự điền Nền tảng vì FixHome chịu khoản hoàn. Admin có trang `/console/admin/customer-wallets` (`AdminCustomerWalletsPage.vue`, mục "Ví khách hàng", PO 09/10/2026): danh sách khách theo số dư (tìm tên, email, số điện thoại; lọc "Chỉ ví còn tiền"; tổng số dư FixHome đang giữ), lịch sử một khách, cộng/trừ với lý do ≥ 10 ký tự qua hộp xác nhận, không trừ quá số dư. API `api/admin-customer-wallets.api.ts`; nhãn loại giao dịch dùng chung `customerWalletTypeLabels` (thêm `adjustment_credit` "FixHome cộng tiền", `adjustment_debit` "FixHome trừ tiền") cho cả trang ví của khách. Trang `/console/admin/payments` (`AdminPaymentsPage.vue`, mục "Thanh toán", PO 09/10/2026, backend `GET /admin/payments`): mọi lần thanh toán (hoá đơn qua VNPay hoặc ví, công nợ thợ, nạp ví) kèm người trả, link mã đơn, cổng, mã tham chiếu, trạng thái; lọc trạng thái, loại, cổng, từ ngày đến ngày (chặn từ > đến); dòng tổng: số lần, tổng tiền đã xác nhận, đang chờ, thất bại. Chỉ xem. API `api/admin-payments.api.ts`. Trang bảo hành `/console/warranty` mở cho cả ADMIN (PO 09/10/2026, mục "Yêu cầu bảo hành" trong menu quản trị): admin xem hàng đợi và tỷ lệ theo thợ, có ghi chú chỉ đọc, không có nút phân công/duyệt/từ chối/đóng (vẫn chỉ SM, khớp backend). Route các trang admin mới có test `tests/admin-console-routes.spec.ts`. Trang `/console/admin/reviews` (`AdminReviewsPage.vue`, mục "Đánh giá của khách", PO 09/10/2026, backend `GET /admin/reviews`): mọi đánh giá kèm số sao (từ 2 sao trở xuống chữ đỏ), nhận xét, thợ, khách, link mã đơn; lọc số sao (đúng số sao hoặc "Từ 2 sao trở xuống"), ngày; dòng tổng có trung bình và phân bố sao. Chỉ xem, chưa có ẩn đánh giá. Bỏ bước khách nghiệm thu (PO 09/10/2026, backend cùng ngày): trang đơn của khách không còn khối "Nghiệm thu" và nút "Xác nhận nghiệm thu"; khi `completionRequestedAt` có và chưa thanh toán thì hiện ngay khung "Kỹ thuật viên đã hoàn thành, mời bạn thanh toán" (`data-testid="pay-after-completion"`). Trang thợ: bước 4/5 là "Hoàn thành"/"Thanh toán", bỏ giai đoạn chờ khách nghiệm thu. `ordersApi.confirmCompletion` đã bỏ. Chữ "nghiệm thu" ở landing, wizard, trang bảo hành đổi theo. Mobile chưa sửa (PO hoãn), endpoint cũ vẫn chạy. Ảnh nhanh hơn, nhận nhiều định dạng (10/10/2026): `utils/image-for-ai.ts` giải mã bằng `createImageBitmap` (xoay theo EXIF) rồi `<img>` (timeout 15 s), nhận mọi file ảnh trình duyệt đọc được (`looksLikeImage`: `image/*` hoặc tên .heic/.heif không có type), giới hạn CẠNH DÀI (AI 1024 px q0.8, thử lại 640 q0.5), mã hoá song song; `normalizeForUpload` vẽ lại thành JPEG ≤ 2048 px q0.85. Wizard đặt lịch chuẩn hoá rồi tải tất cả ảnh song song (gốc tối đa 30 MB; không đọc được thì gửi nguyên nếu JPG/PNG/WebP ≤ 10 MB), `uploadBookingPhoto` timeout 60 s; `accept="image/*,.heic,.heif"` ở wizard và trợ lý AI. API ở `api/customer-wallet.api.ts`.

Đặt lịch theo buổi phía khách (PO 08/10/2026): form đặt lịch (`NewBookingWizardPage.vue`) chọn "Đặt trước theo buổi" (chip ngày 14 ngày tới + Sáng 8-12 / Chiều 13-18, giờ VN, `components/customer/BookingSessionPicker.vue`) hoặc "Tới ngay", kèm ô "Ghi chú cho thợ"; gửi `mode/date/slot/customerNote`, không còn `preferredStartAt`. Chi tiết booking (`BookingDetailPage.vue`) hiện lịch hẹn theo buổi và ghi chú; nút "Đổi buổi hẹn" mới tải `GET /bookings/:id/available-slots` (buổi thợ bận bị khoá kèm lý do), đổi được trước khi có thợ nhận (lượt mời cũ huỷ) và sau khi thợ nhận nhưng chưa xuất phát (thợ được báo). "Đặt lại thợ" (`components/customer/RebookDialog.vue`) ở đơn hoàn tất/đã huỷ (danh sách đơn, chi tiết đơn) và booking đã huỷ: chọn ngày + buổi (xem buổi thợ cũ bận), `POST /bookings/:id/rebook`; mời được thợ cũ thì mở booking mới, không thì sang trang chọn thợ với câu báo. Lời mời phía thợ (trang lời mời, tổng quan) hiện buổi hẹn.

Điểm uy tín (PO 08/10/2026, backend `reputation`): hồ sơ khách (`/app/profile`) và thợ (`/tech/profile`) có `components/account/ReputationCard.vue` gọi `GET /reputation/me`, hiện điểm trên 100, hạn tạm khoá đặt lịch hoặc nhận đơn nếu đang bị khoá, khoá tài khoản khi hết điểm, quy tắc trừ điểm, ngày điểm làm mới và lịch sử. SM có trang `/console/reputation` (`ConsoleReputationPage.vue`, menu "Điểm uy tín"): lọc vai trò, tìm theo tên/email/SĐT, điểm thấp trước, phân trang theo `meta`, xem lịch sử, cộng hoặc trừ điểm kèm lý do (xem trước điểm mới). API ở `api/reputation.api.ts`.

### Trang đơn: tổng tiền, nút huỷ, câu chữ (07/10/2026, nhánh `fix/order-pages-wording-and-totals`)

- Trang đơn của khách: khi báo giá chờ duyệt (chưa có hoá đơn) "Tổng công" và "Tổng phụ tùng" lấy tổng các dòng báo giá thay vì 0; có hoá đơn thì lấy số của đơn (đã gồm phát sinh). Nút Huỷ đơn chỉ hiện ở ACCEPTED và EN_ROUTE vì backend không cho khách huỷ khi đang sửa.
- Trang công việc của kỹ thuật viên: bỏ con số bán kính 200 m và sai số 100 m viết cứng (backend lấy theo cấu hình `geofence.*`, hiện 300 m); thông báo bắt đầu sửa không còn mã trạng thái thô.
- Thư mời nhận việc: bỏ dòng "Mã đơn" hiện UUID booking, bỏ nhãn "Hết hạn sau:" trùng với đồng hồ, bỏ chữ Inbox/TTL.

### AI tắt vẫn đặt lịch được, có hướng dẫn (07/10/2026, nhánh `fix/ai-step-service-hint`)

Ở bước trò chuyện với AI, khi trợ lý đã trả lời mà chưa có dịch vụ (AI không kết nối được hoặc không chọn được), trang hiện "Chọn dịch vụ ở ô bên dưới để đặt thợ." thay vì "Trợ lý sẽ chọn dịch vụ...", để nút Đặt thợ ngay bị khoá không làm khách tưởng bị kẹt.

### Đổi mật khẩu trong hồ sơ, menu khu vực (08/10/2026, nhánh `feat/profile-password-and-sm-areas`)

- `components/account/ChangePasswordCard.vue` ở trang hồ sơ khách và tab Thông tin của kỹ thuật viên: gửi mã về email của tài khoản (`/auth/forgot-password`), nhập mã và mật khẩu mới (`/auth/reset-password`), xong thì đăng xuất để đăng nhập lại. Giống màn Bảo mật trên mobile.
- Menu console có mục "Khu vực phục vụ" (`/console/service-areas`, quản lý dịch vụ và admin); trang đã có từ trước nhưng chưa có lối vào.

### Phía kỹ thuật viên theo buổi (08/10/2026, nhánh `feat/technician-sessions-ui`)

- `utils/booking-session.ts`: nhãn buổi (sáng 8-12, chiều 13-18, "Tới ngay" cho đơn vãng lai) và `canDepartNow`. Trang công việc hiện lịch hẹn theo buổi, ghi chú của khách (vàng), nút Xuất phát chỉ sáng từ `departAvailableAt` (1 giờ trước giờ hẹn, backend cũng chặn).
- `TechnicianLayout` gửi vị trí GPS mỗi 5 phút khi thợ đang nhận việc (`PATCH /technicians/me/location`), dùng cho đơn vãng lai. Thanh bán kính tối đa 40 km.

### Các bước của thợ trong đơn (08/10/2026, nhánh `feat/technician-order-steps`)

- Trang công việc: không còn nút "Bắt đầu sửa chữa" (backend tự chuyển khi đủ điều kiện). Bước tới nơi là một nút "Check-in và chụp ảnh sản phẩm": chọn ảnh trước, rồi check-in GPS, rồi lưu ảnh. Khi đang sửa, nút "Hoàn thành (chụp ảnh sau sửa)" chụp ảnh rồi tự gửi yêu cầu nghiệm thu.
- Sau check-in, menu "Thêm" của trang công việc có "Cần thay đổi thợ": nhập lý do, tạo support case `technician_replacement` (khẩn) cho quản lý. Loại này cũng có trong "Báo cáo vấn đề" của thợ và có nhãn trong console.

### Giao diện kỹ thuật viên gọn lại (10/10/2026, nhánh `feat/technician-ui-redesign`)

- Trang chi tiết công việc (`TechnicianJobDetailPage.vue`) chỉ còn: tiêu đề "Chi tiết công việc" kèm mã đơn, trạng thái và một menu "Thêm"; thẻ "việc cần làm" (một câu, một nút chính, "Bước n/5" và nút "Xem thêm"/"Thu gọn" mở danh sách năm bước); thẻ khách hàng (Gọi, Nhắn tin, Chỉ đường mỗi nút một lần, giá cố định, ảnh khách gửi); một khung gập "Ảnh hiện trường", "Linh kiện", "Chi phí phát sinh". Form báo giá và chọn cách thu tiền nằm trong thẻ việc cần làm khi tới bước đó. Dưới 640px nút chính dính ở đáy, phía trên thanh tab (route meta `actionBar`, layout nâng bong bóng chat lên).
- "Rút khỏi đơn" đổi thành "Huỷ đơn" (menu "Thêm"), hộp xác nhận "Huỷ đơn sửa chữa?" ghi rõ bị trừ điểm uy tín; vẫn gọi `POST /service-orders/:id/cancel` với cùng danh sách lý do. "Cần thay đổi thợ" và "Báo cáo vấn đề" cũng vào menu này; `OrderComplaintPanel` có prop `inline` (chỉ hiện khi đã có báo cáo, form mở qua `openForm` được expose).
- `TechnicianPartsSection` bỏ khung thẻ và khung quy tắc, lỗi đi qua `userFacingError`, phát sự kiện `summary` để trang mở mục Linh kiện khi có việc cần xử lý.
- `TechnicianLayout`: "Đăng xuất" chỉ còn trong menu avatar; menu avatar chỉ còn Ví của tôi, Bảo hành, Xác minh danh tính và chỉ hiện dưới 1024px (thanh bên đã có đủ). Nút "Đang nhận việc" trên header là nút bật tắt duy nhất và chặn bật khi ví dưới mức ký quỹ (gợi ý Nạp tiền). Tiêu đề route khu `/tech` theo mục 7 của `FIXHOME-DESIGN-SYSTEM.md`.
- Các trang Tổng quan, Công việc, Lời mời, Thu nhập, Bảo hành, Ví, Hồ sơ, Xác minh danh tính bỏ nút và đường dẫn trùng, bớt chữ, tải bằng `FhSkeleton`, lỗi có câu dễ hiểu và nút "Thử lại".

### Chứng chỉ khi đăng ký thợ (08/10/2026, nhánh `feat/technician-certificates`)

- Bước KYC của onboarding có phần "Chứng chỉ nghề" không bắt buộc, tối đa 5 ảnh, ghi chú vàng "phải chụp từ bản đã công chứng"; gửi cùng hồ sơ với `documentType: certificate` (backend đã nhận sẵn).
- Màn chờ duyệt và hồ sơ: "Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc." Bỏ các câu sai: "video khuôn mặt" (thực tế là ảnh), "tự động nhận diện", "trong vòng 24 giờ".

### Bố cục khu khách hàng (PO 10/10/2026, nhánh `feat/customer-ui-redesign`)

Không đổi màu, font, token hay `Fh*`; chỉ đổi bố cục, chỗ đặt nút và chữ. Mỗi hành động một lần trên một màn: trang chủ (`CustomerDashboard.vue`) bỏ thẻ "Đặt thợ", "Chẩn đoán hỏng hóc bằng AI", chip AI (đã có ở thanh trên), khẩu hiệu và dòng chú thích nhỏ; đơn, số đếm và dịch vụ gom vào một khối dạng hàng. Danh sách đơn (`CustomerOrdersPage.vue`) thành hàng chia hai nhóm "Yêu cầu đặt lịch" và "Đơn sửa chữa". Chi tiết đơn (`CustomerOrderDetailPage.vue`) gộp hai thẻ chi phí làm một (`data-testid="order-costs"`, chưa báo giá thì một dòng `order-not-quoted`), "Huỷ đơn" và "Yêu cầu bảo hành" khi không có khối bảo hành nằm trong menu "⋯" (`order-more`, `order-cancel`), đánh giá và yêu cầu bảo hành chỉ một nút; khung `pay-after-completion` giữ nguyên điều kiện. Chi tiết yêu cầu đặt lịch (`BookingDetailPage.vue`) có một bước kế tiếp mỗi lúc, "Huỷ yêu cầu đặt lịch" trong menu "⋯" (`booking-more`, nút `booking-start-cancel` giữ nguyên). Trang chọn thợ chỉ còn ô chọn (`select-technician-btn` nay nằm trên ô chọn) và nút "Xem hồ sơ". Bảo hành, ví, hồ sơ, lịch sử, thông báo gom thành khối có hàng và đường chia. Đang tải hiện khung xám đúng hình nội dung (`FhSkeleton`); tải hỏng hiện "Chưa tải được…, vui lòng thử lại." kèm nút "Thử lại", không hiện chữ lỗi của máy chủ. Test `tests/customer-ui-layout.spec.ts`.

## 4. Kiến trúc và thư mục chính

- `src/api/`: 30 module gọi API và `client.ts` (axios dùng chung, tự refresh token khi gặp 401, mọi lỗi đổi sang câu tiếng Việt qua `utils/user-facing-error.ts`).
- `src/router/`: `index.ts` (bảng route, `meta.roles`) và `guards.ts`. Guard chỉ phục vụ trải nghiệm; quyền thật do `backend` quyết.
- `src/layouts/`: Public, Auth, Customer, Technician, Console.
- `src/pages/`: public, auth, customer, technician, console (trang admin ở `console/admin`), chat.
- `src/components/`: thành phần `Fh*` dùng chung và nhóm theo vai trò.
- `src/services/`: `chat-socket.service.ts` (Socket.IO), `webrtc-call.service.ts`, `google-identity.service.ts`.
- `src/stores/`: Pinia `auth`, `chat`, `call`, `notifications`.
- `src/utils/`: định dạng tiền và giờ Việt Nam (`vn-time`), kiểm dữ liệu nhập, ảnh gửi AI.
- `tests/`: spec Vitest.

Role trong web là enum viết hoa `UserRole`; `auth.store` đổi role viết thường của `backend` sang viết hoa.

## 5. Hợp đồng với repo khác

- REST tới `backend` qua `VITE_API_BASE_URL` (mặc định `http://localhost:3000/api/v1`), JWT trong `localStorage` (`access_token`, `refresh_token`), refresh qua `POST /auth/refresh`.
- Danh sách gửi `page` và `pageSize` hoặc `limit` không quá 100; `status` viết thường đúng enum của `backend`.
- Socket.IO tới `<origin của VITE_API_BASE_URL>/chat`: nhận `message:*`, `conversation:updated`, `typing`, `call:*`; gửi `conversation:join`, `conversation:leave`, `typing`, `call:*`.
- AI chỉ qua `POST /ai/diagnoses`, `POST /ai/chat/ask`, `GET /ai/chat/acknowledgements` của `backend`; mô tả tối đa 2000 ký tự, câu hỏi 1000, tối đa 3 ảnh.
- Thông báo đọc qua REST, đếm chưa đọc mỗi 30 giây khi tab đang mở.
- Biến môi trường (chỉ tên): `VITE_API_BASE_URL`, `VITE_MAPTILER_KEY`, `VITE_GOOGLE_CLIENT_ID` (để trống thì ẩn nút Google), `VITE_APP_TITLE` (hiện không dùng), `DEV_HTTPS` (bật HTTPS khi dev để gọi thoại qua mạng LAN). Mọi biến `VITE_*` đều công khai trong bundle, không đặt bí mật.

## 6. Chạy, kiểm thử và cổng chất lượng

- Node theo `.nvmrc` (22.22.2). `npm ci`, chép `.env.example` thành `.env`, `npm run dev`.
- Docker: `docker compose up -d --build`, xem `docs/DOCKER.md`. Thêm biến `VITE_*` mới thì phải thêm cặp `ARG`/`ENV` ở stage `builder` của `Dockerfile`.
- Gate trước mỗi commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CI chạy đúng bốn bước này.
- Quy trình nhánh: tách nhánh từ `dev`, PR vào `dev`, CI xanh mới merge; không merge vào `main`.
- Tính năng mới hoặc sửa tính năng phải làm và kiểm tra trên cả `web` lẫn `mobile` khi vai trò đó có trên cả hai.

## 7. Quyết định đã chốt

- Không có dữ liệu hay luồng giả (PO 07/10/2026): mọi màn hình chỉ hiện dữ liệu thật của `backend`; chỗ chưa có dữ liệu thì bỏ hoặc hiện trạng thái trống trung thực.
- Chẩn đoán AI bắt buộc có mô tả, ảnh không bắt buộc (BRX-064).

- Hai luồng đặt lịch tách riêng: thường (chọn dịch vụ trước) và có AI (chẩn đoán trước, đổi dịch vụ sau).
- Bong bóng chat và trợ lý AI có ở mọi trang của khách hàng; kỹ thuật viên có bong bóng chat ở mọi trang.
- Giao diện khu khách hàng (PO 10/10/2026): một hành động chính mỗi màn, mỗi hành động chỉ xuất hiện một lần, việc hiếm hoặc phá huỷ vào menu "⋯"; tải bằng khung xám đúng hình; không mã lỗi; gom thông tin liên quan vào một khối thay vì mỗi mục một thẻ; bỏ dòng chú thích nhỏ và khẩu hiệu.
- Giao diện khách và kỹ thuật viên theo mục 17 của `FIXHOME-DESIGN-SYSTEM.md`: ít màu, vàng là ghi chú, đỏ là cảnh báo, không hiện mã lỗi, không xuống dòng trong nút, nhãn và số tiền.
- Duyệt KYC và quản lý danh mục chỉ admin; quản lý dịch vụ không thấy các mục đó.
- Khách chọn 1 đến 2 kỹ thuật viên; ví kỹ thuật viên tối thiểu 200.000 ₫ (PO xác nhận 07/10/2026).

## 8. Việc đang dở và rủi ro đã biết

- Thông báo dùng polling, chưa nhận đẩy realtime.
- Mã chết còn trong repo: `layouts/AdminLayout.vue`, `pages/dashboard/DashboardPage.vue`, `utils/storage.ts`, `assets/styles/main.css`, `tests/setup.ts` (chưa nối vào cấu hình Vitest).
- Console chưa có trang chi tiết riêng cho bảo hành và nhật ký thao tác; chi tiết mở ở khung bên. Trang Nhật ký thao tác vẫn hiện mã đối tượng, mã người thực hiện, địa chỉ IP và dữ liệu trước/sau dạng JSON trong khung chi tiết vì đó là nội dung kiểm toán.
- Image Docker dùng Node 20 trong khi `.nvmrc` yêu cầu 22.22.2.
- Check-in trên web chỉ dùng GPS thật của thiết bị; laptop không có GPS sẽ không check-in được (kỹ thuật viên chủ yếu check-in bằng `mobile`).
- Thay đổi ngày 07/10/2026 đã qua gate nhưng CHƯA KIỂM CHỨNG bằng mắt trên trình duyệt từng trang.

## 9. Nhật ký cập nhật context

- 2026-10-10 01:09 (UTC+7) | ToanAltF4 | feat/tech-step-details-ai-summary | Thợ: chi tiết từng bước, tóm tắt AI; sửa chuyển giữa hai form đặt lịch
- 2026-10-10 00:58 (UTC+7) | ToanAltF4 | feat/console-ui-redesign | Làm lại giao diện console: tiêu đề, menu, bảng, lỗi tải thống nhất, bỏ mã thô
- 2026-10-10 00:44 (UTC+7) | ToanAltF4 | feat/customer-ui-redesign | Khu khách hàng: mỗi hành động một lần, menu ⋯ cho huỷ, khung xám khi tải, gom thông tin vào một khối
- 2026-10-10 00:40 (UTC+7) | ToanAltF4 | feat/technician-ui-redesign | Khu kỹ thuật viên gọn lại: trang công việc chỉ hiện việc cần làm, các bước sau Xem thêm, Huỷ đơn thay Rút khỏi đơn, bỏ nút trùng ở layout và các trang
- 2026-10-10 00:14 (UTC+7) | ToanAltF4 | feat/unified-header-landing | Gộp header thống nhất lên dev mới (giữ luật bỏ nghiệm thu ở landing)
- 2026-10-10 00:00 (UTC+7) | ToanAltF4 | feat/faster-photo-handling | Ảnh: chuẩn hoá trước khi tải, nhận nhiều định dạng, song song
- 2026-10-09 23:54 (UTC+7) | ToanAltF4 | feat/unified-header-landing | Header thống nhất: menu tài khoản dùng chung, lịch sử sửa chữa vào menu avatar, landing xếp lại và rút gọn chữ
- 2026-10-09 23:38 (UTC+7) | ToanAltF4 | feat/no-customer-acceptance | Bỏ bước khách nghiệm thu trên web
- 2026-10-09 21:54 (UTC+7) | ToanAltF4 | feat/admin-reviews | Admin xem đánh giá của khách
- 2026-10-09 21:47 (UTC+7) | ToanAltF4 | feat/admin-warranty-view | Admin xem yêu cầu bảo hành (chỉ đọc)
- 2026-10-09 21:30 (UTC+7) | ToanAltF4 | feat/admin-payments | Admin xem danh sách thanh toán
- 2026-10-09 21:17 (UTC+7) | ToanAltF4 | feat/sm-dashboard-replacements | Tổng quan quản lý: yêu cầu đổi thợ đang chờ, đơn tự huỷ vì không xuất phát
- 2026-10-09 20:45 (UTC+7) | ToanAltF4 | feat/admin-customer-wallets | Admin xem và điều chỉnh ví khách
- 2026-10-09 20:34 (UTC+7) | ToanAltF4 | feat/refund-parts-only | Hoàn tiền vào ví chỉ hiện với khiếu nại linh kiện, bảo hành; FixHome chịu
- 2026-10-09 20:04 (UTC+7) | ToanAltF4 | feat/availability-status | Dashboard thợ hiện trạng thái nhận việc theo lịch tuần
- 2026-10-09 19:38 (UTC+7) | ToanAltF4 | feat/admin-technician-search | Admin tra cứu kỹ thuật viên và xem đủ thông tin
- 2026-10-09 19:10 (UTC+7) | ToanAltF4 | feat/sm-replace-technician | SM xử lý yêu cầu đổi thợ: giao thợ khác hoặc huỷ không trừ điểm
- 2026-10-09 18:33 (UTC+7) | ToanAltF4 | feat/customer-wallet-web | Ví khách: trang ví, nạp VNPay, trả hoá đơn bằng ví, SM hoàn tiền vào ví
- 2026-10-09 17:41 (UTC+7) | ToanAltF4 | feat/customer-sessions-web | Khách đặt lịch theo buổi hoặc tới ngay kèm ghi chú, đổi lịch theo buổi thợ còn trống, đặt lại thợ cũ; lời mời phía thợ hiện buổi
- 2026-10-09 15:35 (UTC+7) | ToanAltF4 | feat/auto-reputation-web | Bỏ xác nhận/miễn vi phạm thủ công, trang huỷ đơn hiện số điểm đã trừ, gộp trang Vi phạm vào Điểm uy tín
- 2026-10-09 10:31 (UTC+7) | ToanAltF4 | feat/reputation-web | Điểm uy tín: thẻ điểm ở hồ sơ khách và thợ, trang SM xem lịch sử và điều chỉnh điểm
- 2026-10-09 00:14 (UTC+7) | ToanAltF4 | feat/technician-certificates | Đăng ký thợ: chứng chỉ không bắt buộc (bản công chứng), câu nhắc đến trụ sở sau khi gửi hồ sơ.
- 2026-10-09 00:03 (UTC+7) | ToanAltF4 | feat/technician-order-steps | Thợ: check-in kèm ảnh một nút, hoàn thành kèm ảnh rồi gửi nghiệm thu, bỏ nút bắt đầu sửa, nút cần thay đổi thợ sau check-in.
- 2026-10-08 23:40 (UTC+7) | ToanAltF4 | feat/technician-sessions-ui | Thợ: lịch hẹn theo buổi, ghi chú khách, nút xuất phát theo giờ cho phép, gửi GPS định kỳ, bán kính 40 km.
- 2026-10-08 21:43 (UTC+7) | ToanAltF4 | feat/profile-password-and-sm-areas | Đổi mật khẩu trong hồ sơ khách và thợ; menu console có Khu vực phục vụ.
- 2026-10-07 22:07 (UTC+7) | ToanAltF4 | fix/order-pages-wording-and-totals | Trang đơn khách: tổng tiền khi chờ duyệt báo giá, ẩn huỷ khi đang sửa; trang thợ và thư mời bỏ số cứng, mã thô, UUID.
- 2026-10-07 21:48 (UTC+7) | ToanAltF4 | fix/ai-step-service-hint | Bước AI: khi chưa có dịch vụ sau câu trả lời của trợ lý thì nhắc khách tự chọn dịch vụ.
- 2026-10-07 21:24 (UTC+7) | ToanAltF4 | fix/strike-waive-reason | Miễn vi phạm bắt ghi lý do; câu hậu quả đúng với backend (không tự gỡ tạm khoá).
- 2026-10-07 21:05 (UTC+7) | ToanAltF4 | fix/cash-case-resolution | Case tiền mặt chọn kết quả từ danh sách, gửi đúng mã chốt tiền của backend thay vì gõ tay.
- 2026-10-07 19:37 (UTC+7) | ToanAltF4 | fix/no-fake-data-and-po-decisions | Ghi việc gỡ dữ liệu giả, BRX-064, nút xác nhận vi phạm, khoá cấu hình mới và check-in chỉ dùng GPS thật
- 2026-10-07 14:43 (UTC+7) | ToanAltF4 | docs/repo-context | Tạo file context theo bộ quy tắc chung của bốn repo, ghi hiện trạng sau đợt sửa lỗi ngày 07/10/2026
