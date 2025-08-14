# Multi-stage build: client then server

# 1) Build client
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci || npm i
COPY client/ ./
RUN npm run build

# 2) Install server deps
FROM node:20-alpine AS server-deps
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm ci || npm i
COPY server/ ./

# 3) Runtime image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl

# Copy server
COPY --from=server-deps /app/server /app/server
# Copy client dist into server public folder
RUN mkdir -p /app/server/public
COPY --from=client /app/client/dist /app/server/public

# Data volume for SQLite DB
VOLUME ["/data"]
ENV DB_PATH=/data/app.db

EXPOSE 4000
WORKDIR /app/server
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD curl -fsS http://localhost:4000/api/health || exit 1
CMD ["node", "src/index.js"]
