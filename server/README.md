# Daily Dose Budget - Server

Simple Express server that reads CSVs and exposes JSON APIs.

## Endpoints
- GET /api/health
- GET /api/accounts
- GET /api/transactions
- GET /api/bills
- GET /api/summary
 - POST /api/register
 - POST /api/login

Notes: this server now scopes accounts/transactions/recurrings to the authenticated user and uses JWT tokens (see `server/src/auth.js`).

Place CSVs in `../data-files` when running locally, or mount to `/data-files` in Docker.
