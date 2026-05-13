# Build stage: resolve the full workspace then materialize a self-contained
# api bundle. `pnpm deploy` rewrites workspace symlinks into real copies of
# every transitive workspace dependency (e.g. @outputai/core), so the runtime
# image needs nothing from /repo.
FROM node:24.15.0-slim AS build

WORKDIR /repo

RUN corepack enable

# Workspace metadata first so install layer caches on lockfile changes only
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Source for every workspace package output-api depends on (directly or
# transitively). Keep this list narrow to avoid bloating the build context.
COPY ./api ./api
COPY ./sdk ./sdk

# Install everything output-api needs across the workspace, then materialize
# a self-contained prod bundle at /app.
RUN pnpm install --frozen-lockfile --filter output-api...
RUN pnpm deploy --filter output-api --prod --legacy /app

# Runtime stage: just the deployed bundle
FROM node:24.15.0-slim

WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production

# Use node directly so SIGINT and SIGTERM are forwarded
CMD ["node", "./src/index.js"]
