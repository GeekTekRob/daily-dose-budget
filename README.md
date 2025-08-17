<div align="center">

# 💸 Daily Dose Budget

Personal finance that fits in your day. Track balances, see upcoming bills, and make better money decisions in minutes.

<br/>

<a href="#-features"><img alt="Feature-badge" src="https://img.shields.io/badge/App-Modern,%20Fast,%20Private-4caf50?style=for-the-badge" /></a>
<a href="#-stack"><img alt="React" src="https://img.shields.io/badge/React-18-61dafb?logo=react&style=for-the-badge" /></a>
<a href="#-stack"><img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&style=for-the-badge" /></a>
<a href="#-stack"><img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-blue?logo=sqlite&style=for-the-badge" /></a>
<a href="#-docker"><img alt="Dockerized" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&style=for-the-badge" /></a>

</div>

## Why Daily Dose Budget?
- See what matters at a glance: Current Balance, Upcoming Bills, Real Balance.
- Zero lock‑in: your data lives in a local SQLite file you control.
- Fast, simple, mobile‑friendly UI that respects your time.
- Self‑host in minutes with Docker, or run locally with Node.

## ✨ Features
- Accounts with real‑time balances (including manual balance resets)
- Transactions (credit/debit) with statuses and descriptions
- Bills & Paychecks as recurrings with quick “confirm/skip” actions
- Smart Real Balance: today’s balance minus upcoming commitments
- Secure login with JWT; user‑scoped data for multi‑user setups
- Single binary SQLite – no external database to run

## 📸 Screenshots
Add your screenshots or a short GIF here to showcase the experience.
- Home dashboard (Current / Upcoming / Real Balance)
- Accounts list and balances
- Bills & Paychecks view

> Tip: place images under `docs/` and reference them here.

## 🚀 Quick start

### Option 1: One‑liner (Docker API + local UI dev)
```powershell
cd .\daily-dose-budget
npm run dev:full
```
- API: http://localhost:4000 (healthcheck on /api/health)
- UI dev: http://localhost:5173 (proxies /api to 4000)

### Option 2: Split terminals
- API (Docker):
```powershell
cd .\daily-dose-budget
npm run dev:server:docker:detached
```
- UI (Vite dev):
```powershell
cd .\daily-dose-budget\client
npm install
npm run dev
```

### Option 3: Local API (Node 20 LTS) + local UI
```powershell
cd .\daily-dose-budget\server
npm install
npm start

cd ..\client
npm install
npm run dev
```
> Note: better‑sqlite3 builds native binaries. On Windows, prefer Node 20 LTS or use Docker.

## ⚙️ Configuration (.env)
- Copy `.env.sample` → `.env` and adjust:
	- PORT, HOST — API bind address
	- DB_PATH — SQLite path (e.g., `./data/app.db` locally or `/data/app.db` in Docker)
	- JWT_SECRET — set a strong secret
	- JWT_EXPIRES_IN — e.g., `7d`, `12h`
	- CORS_ORIGIN — `http://localhost:5173` for local Vite dev
- For the client, copy `client/.env.sample` → `client/.env` and set `VITE_API_URL` if your API runs on a different origin in dev.

## 🧭 Using the app
1) Visit http://localhost:4000
2) Click Login → Register a user (auto‑login on success)
3) Create your first Account (optionally set initial balance)
4) Add Bills/Paychecks and confirm items into Transactions
5) Watch Real Balance update as you go

## 🧱 Stack
- React + Vite + Tailwind
- Express + better‑sqlite3 + dayjs
- JWT auth with bcrypt password hashing
- Docker multi‑stage build (client → static assets, served by server)

## 🏗️ Architecture
```
[client (Vite/React)]  →  /api/*  →  [Express API]  →  [SQLite (file on disk)]
								 (optional Vite dev proxy)          (single-file DB you own)
```

## 🗺️ Roadmap
- [ ] Import/Export (CSV)
- [ ] Budget categories and tagging
- [ ] Simple reports (monthly trends)
- [ ] PWA install and offline support
- [ ] Cloud deploy docs (Render/Fly/Heroku alternatives)

## 🤝 Contributing
- Issues and PRs welcome. Good first issues will be labeled.
- Dev fast path:
	- `docker compose up --build -d` to start API
	- `cd client && npm install && npm run dev` to run UI
- Add screenshots/GIFs to `docs/` to improve the gallery.
 - Join the conversation in [Discussions](https://github.com/GeekTekRob/daily-dose-budget/discussions)
 - See the [Wiki](https://github.com/GeekTekRob/daily-dose-budget/wiki) for guides and FAQs

## 🔒 Privacy & Data Ownership
- Your data stays in a local SQLite file (`./data/app.db`).
- No telemetry. No external database required.
- JWT tokens are signed with your `JWT_SECRET`.

## 🧩 Troubleshooting
- Vite can’t resolve packages:
```powershell
cd .\daily-dose-budget\client
rm -r node_modules; del package-lock.json
npm install
```
- Native module build errors on Windows: use Docker or Node 20 LTS.

## 📄 License
MIT © GeekTekRob and Contributors — see [LICENSE](./LICENSE).
See also: [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md), [CONTRIBUTING](./CONTRIBUTING.md), [SECURITY](./SECURITY.md).

— Check the [Changelog](./CHANGELOG.md) for release notes.
