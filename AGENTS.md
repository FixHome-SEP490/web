# FixHome Frontend — Agent Instructions

Before changing code, read the canonical project documentation:

1. [Project Documentation](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/PROJECT_DOCUMENTATION.md)
2. [AI Development Workflow](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/AI_DEVELOPMENT_WORKFLOW.md)
3. [Current Tasks](https://github.com/FixHome-SEP490/Docs-FixHome/blob/main/CURRENT_TASKS.md)

## Frontend Rules

- This Vue application is a UI client; business rules belong in Backend.
- Keep API types and enum values aligned with Backend and Mobile.
- Never call Gemini or OpenAI directly from the browser.
- Coordinate every API contract change with Backend, Mobile, AI, and Docs repositories.
- Run `npm run typecheck` and `npm run build` before reporting completion.
