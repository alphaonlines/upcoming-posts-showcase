# Repository Guidelines

## Project Structure & Module Organization

- `index.html`, `index.tsx`: Vite + React entry points.
- `App.tsx`: top-level application shell and feature composition.
- `components/`: UI modules (PascalCase files like `SalesDashboard.tsx`).
- `services/`: integrations and data access (`firebase.ts`, `geminiService.ts`, `dataService.ts`).
- `functions/`: Firebase Cloud Functions (TypeScript) under `functions/src/`.
- `constants.ts`, `types.ts`: shared constants and TypeScript types.

## Build, Test, and Development Commands

From the repo root:
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server.
- `npm run build`: create a production build (`dist/`).
- `npm run preview`: serve the production build locally.

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
