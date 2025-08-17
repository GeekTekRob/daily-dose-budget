# Getting Started

## Local (Docker + Vite)
- Clone the repo
- Copy `.env.sample` to `.env` and set a strong `JWT_SECRET`
- Start API (Docker): `docker compose up --build -d`
- Start UI: `cd client && npm install && npm run dev`

## Local (Node + Vite)
- Use Node 20 LTS
- `cd server && npm install && npm start`
- `cd ../client && npm install && npm run dev`
