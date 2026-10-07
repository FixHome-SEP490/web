# FixHome Web (`web`) AI Technical Guide

> Ngữ cảnh hiện hành của repo (luồng, hợp đồng, quyết định, việc đang dở) nằm ở [`CONTEXT.md`](CONTEXT.md); khi file này lệch với code hoặc với CONTEXT.md, CONTEXT.md và code là chuẩn.

This document governs all human and AI changes in this independent Vue repository. Preserve the
current client architecture and do not move Backend business logic into the browser.

## 1. Repository Purpose

The `web` repository owns the Vue web experience for all four roles plus public pages: public
landing/services/`/track`/`/vnpay-return`, auth, the Customer app `/app` (plain booking
`/app/bookings/new` and AI-assisted booking `/app/bookings/ai`, orders, warranties, history,
messages, notifications, profile), the Technician app `/tech` (+ `/tech/onboarding`), and the
`/console` for Service Manager and Admin (Admin-only: technicians/KYC, catalog, `admin/*`). It owns
layouts, pages, browser routing, Pinia client state, typed Backend integration, and static assets.

It does not own business validation, authoritative permissions, database access, order state
transitions, or AI-provider calls. Those remain in `backend` and `ai-service`. Cross-system
requirements and contracts belong in the `docs` repository (all under FixHome-SEP490).

## 2. Technology Stack

- Node.js 22.22.2 (`.nvmrc`; `engines` >= 22.22.2) and npm with deterministic `npm ci`
- Vue 3 Composition API and TypeScript 6
- Vite 8 build/dev tooling and `@vitejs/plugin-vue`
- Tailwind CSS 4 through the Vite plugin
- Pinia for client state and Vue Router for navigation
- Axios for the Backend REST API
- socket.io-client for chat and WebRTC call signalling
- maplibre-gl with MapTiler tiles (`VITE_MAPTILER_KEY`)
- lucide-vue-next, vue-sonner, qrcode, lenis for UI support
- ESLint with the official Vue TypeScript configuration
- Vitest (+ @vue/test-utils, happy-dom) for unit tests and `vue-tsc` for type checking

Do not replace Pinia, Vue Router, Axios, Tailwind, Vite, or test/lint tooling without explicit scope.

## 3. Existing Architecture

```text
src/main.ts
  -> App.vue
  -> Vue Router + global auth guard
  -> Public/Auth/Customer/Technician/Console layouts
  -> route pages
  -> Pinia stores, composables and typed utilities
  -> shared Axios client / endpoint modules   -> backend REST API (incl. /ai/*)
  -> chat-socket service (socket.io)           -> <API origin>/chat
```

`src/api/client.ts` centralizes base URL, timeout, JWT attachment, refresh-token retry, and 401
handling; tokens are handled there and in the auth store. Endpoint files use that client.
`src/stores` owns client session/UI state (auth, chat, call, notifications). `src/router` defines
lazy routes and navigation guards. Layouts provide shells; pages orchestrate user interactions.
Components should be introduced under `src/components` only when reuse justifies them.

Realtime: chat and WebRTC call signalling use socket.io to `<API origin>/chat`
(`src/services/chat-socket.service.ts`, `webrtc-call.service.ts`); notifications are polled every
30 seconds. AI goes only through the backend `/ai/*` (self-hosted `ai-service`, Qwen); the browser
never calls an AI provider directly. Maps use MapTiler via maplibre-gl.

Route guards improve UX but are not a security boundary. Backend must repeat every permission and
ownership decision.

## 4. Folder Structure

- `.github/workflows/`: independent web CI.
- `public/`: assets served without bundling.
- `src/api/`: Axios client (`client.ts`) and 30 resource-specific `*.api.ts` endpoint modules.
- `src/assets/`: bundled images and global Tailwind/CSS entry.
- `src/components/`: shared `Fh*` components plus `chat/`, `common/`, `console/`, `customer/`,
  `landing/`, `notifications/`, `technician/`.
- `src/composables/`: `useAiConversation`, `useEvidencePhotos`, `useSmoothScroll`.
- `src/layouts/`: Public, Auth, Customer, Technician, Console shells (`AdminLayout.vue` is unused).
- `src/pages/`: route-level Vue SFCs (~57) under `public/`, `auth/`, `customer/`, `chat/`,
  `technician/`, `console/` (+ `console/admin/`), plus 403/404 pages.
- `src/router/`: route table (`index.ts`) and global guards (`guards.ts`).
- `src/services/`: `chat-socket` (socket.io), `webrtc-call`, `google-identity`.
- `src/stores/`: Pinia stores: auth, chat, call, notifications.
- `src/types/`: API and domain-facing TypeScript contracts.
- `src/utils/`: small browser utilities (formatters, validation, VN time...); `storage.ts` is unused.
- `tests/`: Vitest unit tests and test setup.
- `docs/`: repository-local governance.

## 5. Coding Rules

- Use Vue SFCs with `<script setup lang="ts">` and Composition API unless the existing file uses a
  justified alternative.
- Component names use PascalCase; composables use `useX`; Pinia stores use `useXStore`; endpoint
  modules use `<resource>.api.ts`; variables/functions use camelCase.
- Keep pages thin: reusable visual behavior goes in components/composables and shared state goes in
  Pinia. Do not turn stores into a second business-service layer.
- Use the shared Axios client. Do not duplicate base URLs, token interceptors, or response handling.
- API types reflect Backend contracts exactly. Do not hide an API mismatch with broad `any`, unsafe
  assertions, or client-only enum variants.
- Validate user input for immediate feedback, but assume Backend performs authoritative validation.
- Show safe, actionable errors; do not render stack traces or raw provider/database messages.
- Use Tailwind and existing design tokens/styles consistently. Avoid unrelated visual rewrites.
- Only read browser configuration through `import.meta.env.VITE_*`; document additions in
  `.env.example`. Never place secrets in frontend environment variables.
- Reuse existing code, change the minimum files, and avoid speculative components/abstractions.

## 6. Business Rules

- Web serves Customer, Technician, Service Manager and Admin; behavior must follow approved Docs.
- Backend is authoritative for JWT, RBAC, ownership, validation, quotation approval, assignment,
  and state transitions. Hiding a button never grants or denies real permission.
- Backend role strings are lowercase (`customer`, `technician`, `service_manager`, `admin`); the web
  uses the UPPERCASE `UserRole` enum and the auth store upper-cases the Backend role.
- Display Service Order states from Backend without independently inventing transitions. The order
  is created when the technician accepts, so there is no pre-acceptance order state:

```text
ACCEPTED -> EN_ROUTE -> UNDER_REPAIR -> COMPLETED
ACCEPTED, EN_ROUTE or UNDER_REPAIR -> CANCELLED (who may cancel is decided by Backend)
```

- Booking and Service Order are separate concepts and must not share status values accidentally.
- AI results are advisory, carry confidence/disclaimer information, and must allow manual fallback.
  AI is reached only through Backend `/ai/*`; never call Gemini, OpenAI or any provider from the web.
- Never present scaffolded endpoints/features as operational.

## 7. Security Rules

- Treat localStorage JWTs as sensitive. Never log, render, or include them in error telemetry; clear
  them on invalid sessions. Do not store passwords or provider keys.
- Prevent XSS by relying on Vue escaping; avoid `v-html`. If explicitly required, sanitize with an
  approved and tested policy.
- UI role checks are convenience only. Never assume they prevent IDOR or unauthorized API calls.
- Validate upload type/size before UX submission while relying on Backend for final enforcement.
- Do not put secrets in `VITE_*`, source, assets, test fixtures, or build logs.
- Keep API calls same-origin/CORS-aware and use HTTPS in deployed environments.
- Review authentication state, authorization UX, XSS, unsafe URLs, sensitive data exposure, error
  leakage, and dependency risk for relevant changes.

## 8. Testing Rules

- Unit-test Pinia state, route decisions, formatters, validation behavior, API mapping, and error
  handling with Vitest.
- For pages/components, test user-observable behavior and permissions, not internal implementation.
- Include happy, negative, boundary, invalid-input, permission, network/error, and regression cases
  appropriate to the change.
- Mock the Axios boundary; unit tests must not call live Backend or AI services.
- Contract-sensitive work must be checked against current Backend DTO/enums and Docs.
- `npm run typecheck` is distinct from runtime tests; both must pass.

## 9. CI/CD Rules

`.github/workflows/ci.yml` runs independently for pushes and pull requests targeting `main`, `dev`,
`development`, `develop`, or `Truonghoang`; Node comes from `.nvmrc`. The integration branch is `dev`:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Every command is a blocking quality gate; do not add `continue-on-error`. Deployment of `dist/`
requires a separate approved workflow, environment, and hosting configuration. No server secret may
be injected into the static bundle.

## 10. AI Development Workflow

Execute this sequence before reporting completion:

```text
Task
-> read this guide, CONTEXT.md and relevant `docs` repository requirements/contracts
-> inspect routes/pages/stores/API/types/tests/dependencies
-> BA analysis: actor, use case, input/output, rule, validation, permission, API/state, edge cases,
   affected repositories
-> PM review: exact scope, necessity, no unrequested feature/refactor
-> CTO/Tech Lead review: existing boundaries, API compatibility, state ownership, maintainability
-> impact analysis and minimum implementation
-> Senior Developer review
-> Security review
-> Tester review
-> QA/QC trace: requirement -> Backend contract -> client state/API -> UI -> tests -> docs
-> lint/typecheck/test/build
-> git diff and unintended-change review
-> final architecture review
-> PASS, FAIL, or BLOCKED/NOT VERIFIED
```

When a review finds a defect, analyze root cause, fix, rerun affected gates, and repeat review. Final
reporting includes Task, Repository, Analysis, Files Changed, Implementation, role-by-role Review,
Technical Validation, Issues Found, Auto Fix, Remaining Issues, and Final Status. Only executed
successful checks are `PASS`; unavailable checks are `NOT VERIFIED`.
