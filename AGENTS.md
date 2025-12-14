# Repository Guidelines

## Project Structure & Module Organization

- `index.html`, `index.tsx`: Vite + React entry points.
- `App.tsx`: top-level application shell and feature composition.
- `components/`: UI modules (PascalCase files like `SalesDashboard.tsx`).
- `services/`: integrations and data access (`posBackendApi.ts`, `tasksService.ts`, `tasksApi.ts`, `firebase.ts`, `geminiService.ts`, `dataService.ts`).
- `functions/`: Firebase Cloud Functions (TypeScript) under `functions/src/`.
- `constants.ts`, `types.ts`: shared constants and TypeScript types.

## Build, Test, and Development Commands

From the repo root:
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server.
- `npm run build`: create a production build (`dist/`).
- `npm run preview`: serve the production build locally.

### POS Dashboard Backend (Postgres + Importer + API)

Backend lives in `pos-dashboard-backend/` and is used by the React dashboard via HTTP.

- Start Postgres (Docker):
  - `cd pos-dashboard-backend && docker-compose up -d`
  - If you see `permission denied ... /var/run/docker.sock`, use `sudo docker-compose up -d` or add your user to the `docker` group.
- Apply/upgrade schema (safe to re-run):
  - `cd pos-dashboard-backend`
  - `psql "postgres://salesapp:dev_password_change_me@127.0.0.1:5432/salesdb" -f db/schema.sql`
- Import POS exports:
  - Put export files in `pos-dashboard-backend/incoming/` (supports `.xlsx` and `.xls`).
  - Create/activate venv: `cd pos-dashboard-backend && source .venv/bin/activate`
  - Install deps: `pip install -r importer/requirements.txt`
  - Run import: `python importer/import_pos_xlsx.py`
  - Re-import without moving files: `python importer/import_pos_xlsx.py --include-processed --no-move`
  - Safety: importer stops on `sale_id` collisions across different `sale_date` unless `--allow-id-collisions` is passed (important if `Sales#` repeats across years).
- `.xls` note:
  - Some `.xls` exports are actually HTML tables; importer parses them and attempts to preserve `<a href>` links (e.g. Note links).
- Start API:
  - `cd pos-dashboard-backend && npm run dev` (defaults to `http://127.0.0.1:5055`)

### Frontend ↔ Backend

- Frontend defaults to the POS backend at `http://127.0.0.1:5055`; override with `VITE_POS_API_BASE_URL`.
- If `localhost:5173` refuses to connect, Vite is configured to bind to `::` in `vite.config.ts` so both `localhost` and `127.0.0.1` should work; ensure `npm run dev` is running.

### Tasks Board (Local DB)

The Tasks page is a shared task board stored in the local Postgres DB via the POS backend API.

- Backend storage:
  - Table: `tasks` (created in `pos-dashboard-backend/db/schema.sql`)
  - Endpoints:
    - `GET /api/tasks`
    - `POST /api/tasks`
    - `PATCH /api/tasks/:id`
- Frontend implementation:
  - UI: `components/TaskManager.tsx` (drag between columns; due date can be set after marking Done)
  - API client: `services/tasksApi.ts` (talks to POS backend)
  - Sync/persistence: `services/tasksService.ts` (uses POS backend when available; falls back to browser `localStorage` if the backend is offline)
- Status visibility:
  - `components/SalesDashboard.tsx` shows POS backend connectivity + whether Tasks are using Postgres (shared) or browser-only fallback.

For Cloud Functions:
- `cd functions && npm install`: install function dependencies.
- `cd functions && npm run build`: compile to `functions/lib/`.
- Firebase CLI required for emulator/deploy (e.g., `npm i -g firebase-tools`).
- `cd functions && npm run serve`: run Firebase emulators for functions.
- `cd functions && npm run deploy`: deploy functions to Firebase.

## Coding Style & Naming Conventions

- Language: TypeScript + React; prefer small, focused components and typed service APIs.
- Styling: Tailwind is loaded via CDN in `index.html`; use utility classes in JSX.
- Formatting: follow existing style (2-space indentation, mostly double quotes).
- Naming: `PascalCase` for React components, `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants.
- Keep types close to usage; share cross-cutting types via `types.ts`.

## Testing Guidelines

No test framework is currently configured in the root app. If you add tests, keep them colocated (e.g., `components/__tests__/...`) and add a `test` script in `package.json`. The `functions/` package includes `firebase-functions-test` but no test runner is wired up yet.

## Commit & Pull Request Guidelines

There’s no established commit style yet; use clear, imperative messages (prefer Conventional Commits like `feat: ...`, `fix: ...`).
For PRs: include a short summary, linked issues, manual test steps, and screenshots for UI changes.

## Security & Configuration

- Do not commit secrets: use `.env.local` for local-only keys.
- Gemini: `.env.local` currently uses `GEMINI_API_KEY`, while `services/geminiService.ts` reads `process.env.API_KEY`; keep these consistent when contributing (and remember Vite only exposes `VITE_*` vars to the browser by default).
- Firebase: config placeholders live in `services/firebase.ts`; replacing them enables live mode, otherwise the app runs in mock-data mode.
