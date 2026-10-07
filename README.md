<p align="center">
  <img src="public/logo.png" alt="FixHome Logo" width="120" />
</p>

<h1 align="center">FixHome — Web Frontend</h1>

> Ngữ cảnh hiện hành của repo (luồng, hợp đồng, quyết định, việc đang dở) nằm ở [`docs/CONTEXT.md`](docs/CONTEXT.md); khi file này lệch với code hoặc với CONTEXT.md, CONTEXT.md và code là chuẩn.

<p align="center">
  <strong>Ứng dụng web Vue.js cho nền tảng sửa chữa & bảo trì tại nhà FixHome: trang công khai, khách hàng, kỹ thuật viên và console vận hành (Service Manager, Admin)</strong>
</p>

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Vue.js 3 |
| Language | TypeScript |
| Build Tool | Vite |
| CSS | TailwindCSS 4 |
| State | Pinia |
| Routing | Vue Router |
| HTTP | Axios (`src/api/client.ts`, tự refresh token) |
| Realtime | socket.io-client (namespace `/chat`: chat + tín hiệu gọi WebRTC) |
| Maps | MapTiler qua maplibre-gl |
| UI phụ trợ | lucide-vue-next, vue-sonner, qrcode, lenis, @selemondev/vue3-marquee |
| Testing | Vitest, @vue/test-utils, happy-dom, vue-tsc |
| Lint | ESLint + eslint-plugin-vue + @vue/eslint-config-typescript |

## Prerequisites

- **Node.js** 22.22.2 (`.nvmrc`; `engines` yêu cầu >= 22.22.2)
- **npm** >= 9

## Quick Start

```bash
cp .env.example .env
npm ci
npm run dev
```

- Web: http://localhost:5173

## Phạm vi ứng dụng

- Công khai: landing, bảng giá/chi tiết dịch vụ, `/track`, `/vnpay-return`.
- Auth: đăng nhập (kể cả Google), đăng ký, xác thực OTP, quên mật khẩu.
- Khách hàng `/app`: đặt lịch thường `/app/bookings/new`, đặt lịch nhờ AI `/app/bookings/ai`, đơn, bảo hành, lịch sử thiết bị, tin nhắn, thông báo, hồ sơ.
- Kỹ thuật viên `/tech` (+ `/tech/onboarding`): lời mời, việc được giao, bảo hành, thu nhập, ví, hồ sơ, KYC, tin nhắn.
- Console `/console` cho `SERVICE_MANAGER` và `ADMIN`; trang chỉ Admin: thẩm định kỹ thuật viên/KYC, danh mục, `admin/*`; một số trang chỉ Service Manager (huỷ đơn, vi phạm, hỗ trợ, bảo hành).

Role phía web dùng enum `UserRole` viết HOA; backend trả role chữ thường và auth store tự upper-case.
AI chỉ đi qua backend `/ai/*` (ai-service tự host). Chat và tín hiệu gọi thoại qua socket.io tới
`<API origin>/chat`; thông báo được poll mỗi 30 giây.

## Project Structure

```
├── public/                # Static assets
│   ├── logo.png
│   ├── favicon.png
│   └── icons.svg
├── src/
│   ├── App.vue            # Root component
│   ├── main.ts            # Entry point
│   ├── api/               # client.ts (Axios, JWT, refresh token) + 30 module *.api.ts
│   ├── assets/            # Images, styles
│   ├── components/        # Fh* dùng chung + chat/ common/ console/ customer/ landing/ notifications/ technician/
│   ├── composables/       # useAiConversation, useEvidencePhotos, useSmoothScroll
│   ├── layouts/           # Public, Auth, Customer, Technician, Console (AdminLayout.vue không còn dùng)
│   ├── pages/             # Route pages (~57 SFC)
│   │   ├── public/        # Landing, dịch vụ, /track, /vnpay-return...
│   │   ├── auth/          # Đăng nhập, đăng ký, OTP, quên mật khẩu
│   │   ├── customer/      # /app: đặt lịch thường + nhờ AI, đơn, bảo hành, lịch sử, hồ sơ, thông báo
│   │   ├── chat/          # Tin nhắn (/app/messages, /tech/messages)
│   │   ├── technician/    # /tech và /tech/onboarding
│   │   └── console/       # /console cho Service Manager & Admin (admin/ chỉ Admin)
│   ├── router/            # index.ts (route table), guards.ts
│   ├── services/          # chat-socket (socket.io), webrtc-call, google-identity
│   ├── stores/            # Pinia: auth, chat, call, notifications
│   ├── types/             # TypeScript types (UserRole viết HOA)
│   └── utils/             # Formatter, validation, giờ VN... (storage.ts không còn dùng)
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Environment Variables

See [.env.example](.env.example) for configuration (`VITE_API_BASE_URL`, `VITE_MAPTILER_KEY`, `VITE_GOOGLE_CLIENT_ID`...).

## Quality Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Related Repositories

- [Backend API](https://github.com/FixHome-SEP490/backend)
- [Mobile](https://github.com/FixHome-SEP490/mobile)
- [AI Service](https://github.com/FixHome-SEP490/ai-service)
- [Project Documentation](https://github.com/FixHome-SEP490/docs)

## Engineering Governance

Before any change, read [AGENTS.md](AGENTS.md) and the repository-specific
[AI Technical Guide](docs/AI-TECHNICAL-GUIDE.md). The independent CI workflow (push/PR on `main`, `dev`,
`development`, `develop`, `Truonghoang`) enforces every quality command listed above. Nhánh tích hợp là `dev`.
