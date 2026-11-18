# Use Node.js slim image for smaller size
FROM node:24.15.0-slim

# Set working directory
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Copy root package files for workspace resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy API package.json for workspace detection
COPY ./projects/api/package.json ./projects/api/

# Install only API workspace dependencies
RUN pnpm install --frozen-lockfile --filter output-api

# Copy the rest of the API code
COPY ./projects/api ./projects/api

WORKDIR /app/projects/api

ENV NODE_ENV=production

# Use node directly so SIGINT and SIGTERM are forwarded
CMD ["node", "./src/index.js"]
