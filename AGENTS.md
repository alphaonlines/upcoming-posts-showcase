# Repository Guidelines

## Project Structure & Module Organization

- `index.html`, `index.tsx`: Vite + React entry points.
- `App.tsx`: top-level application shell and feature composition.
- `components/`: UI modules (PascalCase files like `SalesDashboard.tsx`).
- `services/`: integrations and data access (`posBackendApi.ts`, `tasksService.ts`, `tasksApi.ts`, `firebase.ts`, `geminiService.ts`, `dataService.ts`).
- `functions/`: Firebase Cloud Functions (TypeScript) under `functions/src`.
- `constants.ts`, `types.ts`: shared constants and TypeScript types.

## Build, Test, and Development Commands

From the repo root:
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server.
- `npm run build`: create a production build (`dist/`).
- `npm run preview`: serve the production build locally.

## Home Server Deployment Guide

This guide walks through setting up the Furniture Distributors Dashboard on your home server for production use. Assumes a Linux server (e.g., Ubuntu/Debian) with sudo access, Node.js 18+, Python 3.8+, and internet access. Total time: 1-2 hours.

### Prerequisites
- **Server OS**: Linux (Ubuntu 20.04+ recommended).
- **Node.js**: v18+ (install via `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`).
- **Python**: 3.8+ with pip (usually pre-installed; `sudo apt install python3-pip` if needed).
- **PostgreSQL**: `sudo apt update && sudo apt install postgresql postgresql-contrib`.
- **PM2**: `npm install -g pm2` (for process management).
- **Git**: `sudo apt install git`.
- **Optional**: Nginx/Apache for reverse proxy, SSL certs.

### Step 1: Clone and Install
1. SSH into your server: `ssh user@your-server-ip`.
2. Clone the repo: `git clone https://github.com/your-repo/furniture-distributors-dashboard.git` (replace with actual repo URL).
3. Enter directory: `cd furniture-distributors-dashboard`.
4. Install frontend deps: `npm install`.
5. Install backend deps: `cd pos-dashboard-backend && npm install`.
6. Set up Python venv: `python3 -m venv .venv && source .venv/bin/activate && pip install -r importer/requirements.txt`.

### Step 2: Set Up Database
1. Start PostgreSQL: `sudo systemctl start postgresql && sudo systemctl enable postgresql`.
2. Create DB user/role: `sudo -u postgres createuser salesapp && sudo -u postgres createdb salesdb && sudo -u postgres psql -c "ALTER USER salesapp PASSWORD 'your_secure_password';"`.
3. Apply schema: `psql -U salesapp -d salesdb -f db/schema.sql` (replace password in command or use env vars).
4. **Security Note**: Change default password to something strong; avoid hardcoding.

### Step 3: Import Data
1. Upload Excel files (.xls/.xlsx) to `pos-dashboard-backend/incoming/` (via SCP/SFTP).
2. Run import: `source .venv/bin/activate && python importer/import_pos_xlsx.py`.
3. Verify: `psql -U salesapp -d salesdb -c "SELECT COUNT(*) FROM pos_sales;"` (should show rows, e.g., 10k+).
4. **Automation**: Set up cron for daily imports: `crontab -e` add `0 2 * * * cd /path/to/repo/pos-dashboard-backend && source .venv/bin/activate && python importer/import_pos_xlsx.py`.

### Step 4: Configure and Build
1. **Environment Vars**: Create `.env` in `pos-dashboard-backend/` with `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGDATABASE=salesdb`, `PGUSER=salesapp`, `PGPASSWORD=your_password`.
2. **Optional**: For Gemini AI, add `API_KEY=your_key` (Vite uses `VITE_API_KEY` in root `.env.local`).
3. Build frontend: `cd .. && npm run build` (creates `dist/`).
4. **Reverse Proxy (Nginx Example)**:
   - Install: `sudo apt install nginx`.
   - Create site: `sudo nano /etc/nginx/sites-available/furniture-dashboard`.
     ```
     server {
         listen 80;
         server_name your-domain.com;  # Or IP
         root /path/to/repo/dist;
         index index.html;
         location / {
             try_files $uri $uri/ /index.html;
         }
         location /api/ {
             proxy_pass http://127.0.0.1:5055;
             proxy_set_header Host $host;
         }
     }
     ```
   - Enable: `sudo ln -s /etc/nginx/sites-available/furniture-dashboard /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`.
   - **SSL**: Use Certbot for HTTPS: `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`.

### Step 5: Start Services with PM2
1. Start backend: `pm2 start npm --name furniture-backend -- run dev` (in `pos-dashboard-backend/`).
2. Start frontend: `pm2 start npm --name furniture-frontend -- run preview` (in root, or serve via Nginx).
3. Save config: `pm2 save`.
4. Enable auto-start: `pm2 startup` (run the generated sudo command).
5. Check: `pm2 list` (both should be online).
6. Access: `http://your-server-ip` or `https://your-domain.com`.

### Step 6: Post-Setup Tasks
- **Backups**: Schedule DB dumps: `pg_dump salesdb > backup.sql` via cron.
- **Monitoring**: Use `pm2 logs` or set up alerts.
- **Updates**: Pull latest code, rebuild, restart PM2.
- **Security**: Firewall (ufw), regular updates, no root processes.
- **Troubleshooting**:
  - Ports in use: Change defaults (e.g., API to 5056).
  - DB issues: Check logs, ensure PG is running.
  - Import fails: Verify Excel format, permissions.

### Features Overview
- **Sales Dashboard**: Analytics with leaderboards, trends, finance summaries.
- **Lowest Margins**: Table of top 5 low-margin sales per salesperson, sortable, with clickable links to external sale pages.
- **Tasks**: Shared task board via DB.
- **Data**: Supports 2024-2025 sales; margins calculated correctly.

Contact support if issues arise. Enjoy your self-hosted dashboard!

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

## Recent Changes (2026-01-31)
- Moved FD public pages to subdomain: https://furnituredistributors.wolf.discount/
- Added redirects from https://wolf.discount/furnituredistributors/* and /fd/ to the new subdomain.
- Enabled /fd/ app on the subdomain with /fd/api/* routed to :5057.
- Added quick-links index page on the subdomain root with a dashboard button.
- Bedroom page restored with mobile-friendly stacking only (no snow effect).
- Added CSV upload modal button to FD dashboard (/fd/) gated by dashboard unlock; posts to /fd-upload-csv.
- Nginx now listens on 0.0.0.0:80/443 and :443/:80 IPv6; SSL issued for subdomain.
