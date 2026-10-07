# Context repo web — FixHome

> Cập nhật lần cuối: 2026-10-07 14:43 (UTC+7) · Người cập nhật (git): ToanAltF4 · Nhánh: docs/repo-context

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

### Khách hàng (`/app`)

- Hai form đặt lịch trên cùng trang `NewBookingWizardPage.vue`: `/app/bookings/new` khách tự chọn dịch vụ, không có AI; `/app/bookings/ai` khách mô tả và gửi tối đa 3 ảnh, trò chuyện với AI, AI gợi ý dịch vụ và khách được đổi. AI lỗi không chặn đặt lịch.
- Chọn 1 đến 2 kỹ thuật viên ở trang ứng viên, theo dõi booking, huỷ, đổi lịch, gia hạn tìm thợ.
- Đơn sửa chữa: duyệt hoặc từ chối báo giá và chi phí phát sinh, xem hoá đơn, thanh toán VNPay hoặc tiền mặt, xác nhận hoàn tất, xem bằng chứng, bảo hành và yêu cầu bảo hành, đánh giá kỹ thuật viên, khiếu nại.
- Lịch sử sửa chữa, hồ sơ và sổ địa chỉ (gợi ý địa chỉ qua `backend`), thông báo.
- Bong bóng trợ lý AI (`AiAssistantWidget`) chuyển cuộc trò chuyện sang `/app/bookings/ai?aiSession=...`. Bong bóng chat với kỹ thuật viên (`ChatFloatingWidget`) kèm gọi thoại WebRTC, có ở mọi trang của khách và kỹ thuật viên.

### Kỹ thuật viên (`/tech`)

Onboarding và KYC, bật tắt nhận việc (cần đủ số dư ví), lời mời (nhận hoặc từ chối), danh sách và chi tiết công việc (đi đến, check-in GPS, bắt đầu sửa, ảnh trước và sau, báo giá, chi phí phát sinh, linh kiện, khai tiền mặt, huỷ), bảo hành, thu nhập, ví (nạp qua VNPay, tài khoản ngân hàng, rút tiền qua payOS), hồ sơ (kỹ năng và giá công, lịch, ngày nghỉ, đánh giá).

### Console (`/console`)

- Cả quản lý dịch vụ và admin: tổng quan, đơn, booking (gán thợ thủ công), yêu cầu linh kiện, ví và rút tiền, khu vực phục vụ.
- Chỉ quản lý dịch vụ: huỷ đơn, vi phạm, hỗ trợ và tranh chấp (kể cả tiền mặt), bảo hành.
- Chỉ admin: kỹ thuật viên và duyệt KYC, danh mục dịch vụ, duyệt kỹ năng, người dùng, cấu hình hệ thống, linh kiện, công nợ nền tảng, nhật ký audit.

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

- Hai luồng đặt lịch tách riêng: thường (chọn dịch vụ trước) và có AI (chẩn đoán trước, đổi dịch vụ sau).
- Bong bóng chat và trợ lý AI có ở mọi trang của khách hàng; kỹ thuật viên có bong bóng chat ở mọi trang.
- Giao diện khách và kỹ thuật viên theo mục 17 của `FIXHOME-DESIGN-SYSTEM.md`: ít màu, vàng là ghi chú, đỏ là cảnh báo, không hiện mã lỗi, không xuống dòng trong nút, nhãn và số tiền.
- Duyệt KYC và quản lý danh mục chỉ admin; quản lý dịch vụ không thấy các mục đó.
- Khách chọn 1 đến 2 kỹ thuật viên; ví kỹ thuật viên tối thiểu 200.000 ₫ (PO xác nhận 07/10/2026).

## 8. Việc đang dở và rủi ro đã biết

- Thông báo dùng polling, chưa nhận đẩy realtime.
- `/console/service-areas` có route nhưng chưa có mục trên sidebar.
- Mã chết còn trong repo: `layouts/AdminLayout.vue`, `pages/dashboard/DashboardPage.vue`, `utils/storage.ts`, `assets/styles/main.css`, `tests/setup.ts` (chưa nối vào cấu hình Vitest).
- `walletApi.topUp` luôn trả `success: true` bất kể phản hồi.
- Một số tiêu đề trang console còn lẫn tiếng Anh.
- Image Docker dùng Node 20 trong khi `.nvmrc` yêu cầu 22.22.2.
- Trang chi tiết công việc của kỹ thuật viên có lối tắt check-in chỉ bật khi chạy dev (`import.meta.env.DEV`).

## 9. Nhật ký cập nhật context

- 2026-10-07 14:43 (UTC+7) | ToanAltF4 | docs/repo-context | Tạo file context theo bộ quy tắc chung của bốn repo, ghi hiện trạng sau đợt sửa lỗi ngày 07/10/2026
