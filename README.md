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
