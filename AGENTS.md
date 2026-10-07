# FixHome Web Frontend — Agent Instructions

This Vue application is an independent Git repository and a UI client of Backend-FixHome.

## Repository context (read first, keep current)

`docs/CONTEXT.md` is the living context of this repository: what it owns, how it links to the other
FixHome repositories, the current state, contracts, settled PO decisions and open risks. Read it
before `docs/AI-TECHNICAL-GUIDE.md` and before touching code.

Any change that alters behaviour, an API or event contract, an enum, an environment variable, a
migration, how the project runs or is verified, or a PO decision must update `docs/CONTEXT.md` in
the same pull request, following its section 0 exactly: real Vietnam time (UTC+7), the exact
`git config user.name`, the branch, and a new top line in section 9. `tests/context-doc.spec.ts` enforces the
format in the normal test run and in CI; never weaken that test to make a change pass. The
repository is public: never write secrets, credentials, IP addresses or customer data into it.

## Mandatory pre-implementation gate

Before every task, read FIXHOME-DESIGN-SYSTEM.md completely together with
docs/AI-TECHNICAL-GUIDE.md. Follow its cross-platform language, terminology,
design-token, typography, title, component, status, and verification rules.
For UI or user-facing output changes, inspect the matching Web/Mobile behavior.
Preserve this repository's architecture, API contracts, permissions, and tests.
If cross-repository verification is unavailable, explicitly report NOT VERIFIED.

Before doing any task:

0. Read `docs/CONTEXT.md` completely.
1. Read `docs/AI-TECHNICAL-GUIDE.md` and `FIXHOME-DESIGN-SYSTEM.md` completely.
2. Inspect the existing project structure and affected route, page, store, or API module.
3. Understand the current Vue/Pinia/router/API-client architecture.
4. Identify existing TypeScript, Vue SFC, styling, state, and test conventions.
5. Check `package.json`, Vite/TypeScript configuration, and relevant dependencies.
6. Search for an existing implementation before creating code.
7. Do not modify unrelated files.
8. Do not restructure the project unless explicitly requested.
9. Preserve Backend API contracts, enum values, permissions, and business rules.
10. After implementation, execute the complete review process in the technical guide.

If the technical guide has not been read, implementation must not begin.

## Repository rules

- Keep business rules and authoritative authorization in Backend; route guards are UX only.
- Use the shared Axios client and Pinia stores instead of duplicating transport or state logic.
- Keep request/response types and enums aligned with Backend and Mobile.
- Never call the AI service, a payment gateway or a database directly from the browser; AI goes
  through the Backend `/ai/*` routes only.
- Never expose server secrets through `VITE_*`; all such values are public at build time.
- Coordinate contract changes with the `backend`, `mobile`, `ai-service` and `docs` repositories,
  and update `docs/CONTEXT.md` in each affected repository.

## Keep Docker working

This repository ships a `docker-compose.yml` that other developers run daily.

Vite inlines every `VITE_*` variable at **build** time, not at run time. So whenever you add one to
`.env.example`, add the matching pair to the `builder` stage of `Dockerfile` as well:

```dockerfile
ARG VITE_YOUR_NEW_VAR
ENV VITE_YOUR_NEW_VAR=${VITE_YOUR_NEW_VAR}
```

Skipping that has already broken a feature once: `VITE_GOOGLE_CLIENT_ID` was missing from the
Dockerfile, so the Google button worked under `npm run dev` and silently disappeared in the Docker
build, with no way to fix it at startup.

Also keep in mind:

- Adding or removing a dependency changes the image. Tell the team to run
  `docker compose up -d --build`; the mounted volumes only carry `src`, `public` and `index.html`.
- Never mount the repository root into the container — the Windows `node_modules` would shadow the
  Linux one built inside the image.
- The dev server must keep `--host 0.0.0.0`, otherwise it only listens inside the container.

After a change that touches the image or the runtime contract, verify with
`docker compose up -d --build` and load `http://localhost:5173` before handing over.
`docs/DOCKER.md` explains the setup for people new to Docker — keep it true when you change it.

## Required verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Review `git diff` and
report unexecuted checks as `NOT VERIFIED`; never convert them to `PASS`.
