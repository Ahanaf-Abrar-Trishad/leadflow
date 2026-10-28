# Production image for the LeadFlow console. The worker and poller run
# in-process (see instrumentation.ts), so this one container is the whole app.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Migrations are idempotent, so applying them on every start keeps a fresh
# VPS and an upgraded one on the same schema without a separate step.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
