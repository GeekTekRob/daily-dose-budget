# Daily Dose Budget

Modern, mobile-first budgeting app showing Current Balance, Upcoming Bills, and Real Balance, with simple pages to manage Accounts, Bills, and Transactions. Self‑hostable and DB‑backed (SQLite).

## Monorepo layout
- `server/` Express API + SQLite (better-sqlite3)
- `client/` React + Vite + Tailwind
- `Dockerfile` multi-stage build (client build + server runtime)
- `docker-compose.yml` runs the server with a persistent volume at `./data`

## Data storage
- SQLite database stored under `./data/app.db` (persisted by Docker Compose or created locally on first run)

## Run options

### A) One command (Docker API + local UI dev)
```powershell
cd .\daily-dose-budget
npm run dev:full
```
- API runs in Docker at http://localhost:4000 (with healthcheck)
- UI dev server starts at http://localhost:5173 and proxies /api to 4000

### B) Split terminals
- API (Docker):
```powershell
cd .\daily-dose-budget
npm run dev:server:docker:detached
```
- UI:
```powershell
cd .\daily-dose-budget\client
npm install
npm run dev
```

### C) Local API (Node 20.x) + local UI
Better-sqlite3 needs Node 20 LTS on Windows to avoid build tools.
```powershell
cd .\daily-dose-budget\server
npm install
npm start

cd ..\client
npm install
npm run dev
```

## API endpoints (high level)
- GET /api/health
- Accounts: GET /api/accounts, POST /api/accounts, DELETE /api/accounts/:id, GET /api/accounts-summary
- Bills: GET /api/bills (upcoming), POST /api/bills, DELETE /api/bills/:id
- Transactions: GET /api/transactions, POST /api/transactions, PATCH /api/transactions/:id
- Summary: GET /api/summary (current, upcomingTotal, realBalance)

## Authentication
- The API provides `POST /api/register` and `POST /api/login`.
- After login the server returns a token which the client stores in `localStorage` and sends as `Authorization: Bearer <token>` on subsequent requests.
- By default tokens do not expire. This repo uses a simple HMAC-signed token in `server/src/auth.js`.

Notes: the current implementation is intentionally minimal for a self-hosted demo. See `server/src/auth.js` for details and consider replacing with JWT + bcrypt/argon2 and user-scoped data for production.

## Quick start — create an account and use the UI
1. Start services (Docker):
```powershell
docker compose up --build -d
```
2. Visit http://localhost:4000 in your browser.
3. Click "Login" in the header and choose Register to create a user. After registering you'll be automatically logged in and the client will send the token with API requests.

## Dev checklist
- Rebuild the Docker images after client/client code changes: `docker compose build && docker compose up -d`.
- To run only the client in dev mode (fast feedback): `cd client && npm install && npm run dev` (you'll want the API running at :4000).
- To run tests: `npm run test` at repo root (runs server and client tests via workspace scripts).

## Docker
```powershell
cd .\daily-dose-budget
docker compose up --build
```
- Persists DB to `./data`
- Healthcheck probes `/api/health` (container shows (healthy) in `docker ps`)
- Visit http://localhost:4000 (serves built client in production)

## Troubleshooting
- If Vite fails to resolve packages, reinstall client deps:
```powershell
cd .\daily-dose-budget\client
rm -r node_modules; del package-lock.json
npm install
```
- If the API fails to start locally due to native module build errors, use Docker or switch to Node 20.x LTS.
