# Daily Dose Budget

Modern, mobile-first dashboard showing Current Balance, Real Balance (after bills), recent transactions, and upcoming bills. CSV-driven, self-hostable.

## Monorepo layout
- `server/` Express API reads CSVs from `data-files/`
- `client/` React + Tailwind single-page app
- `data-files/` CSVs (account.csv, bill.csv, transaction.csv)
- `Dockerfile` multi-stage build (client build + server runtime)

## Quick start (local)
1. Server
   - cd server
   - npm install
   - npm run start
2. Client
   - cd client
   - npm install
   - npm run dev

Open http://localhost:5173

## Docker
- Build and run
   - docker compose up --build
- Or with docker only
   - docker build -t daily-dose-budget .
   - docker run -p 4000:4000 -v %CD%/data-files:/data-files:ro daily-dose-budget

Healthcheck: container exposes /api/health and Dockerfile includes a HEALTHCHECK. When healthy, you should see (healthy) in `docker ps`.

Visit http://localhost:4000
