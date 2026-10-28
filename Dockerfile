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
# `next build` loads route modules, and db/client.ts refuses to load without
# DATABASE_URL. A placeholder is enough: the client opens no connection until
# a query runs, and setting it on the RUN line keeps it out of the image.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Migrations are idempotent, so applying them on every start keeps a fresh
# VPS and an upgraded one on the same schema without a separate step.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
