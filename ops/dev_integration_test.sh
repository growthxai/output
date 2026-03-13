#!/bin/bash

set -e
set -o pipefail

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  echo -e "\e[44;30m $sym \e[0m $1"
}

CLI="./sdk/cli/bin/run.js"
# Compose file path written by `npm run build:packages` (copy-assets step)
COMPOSE_FILE="./sdk/cli/dist/assets/docker/docker-compose-dev.yml"

export OUTPUT_API_URL="http://localhost:3001"
export OUTPUT_API_VERSION="dev"
export OUTPUT_WORKFLOWS_DIR="test_workflows"

cleanup() {
  print "Cleaning up..." "↓"
  docker compose -f "$COMPOSE_FILE" --project-directory "$(pwd)" \
    down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Ensure .env exists (worker reads it via env_file in the compose)
if [ ! -f test_workflows/.env ]; then
  print "Creating minimal test_workflows/.env..."
  printf 'ANTHROPIC_API_KEY=dummy\nOPENAI_API_KEY=dummy\n' > test_workflows/.env
fi

# Step 1: install dependencies and build all SDK packages.
# Runs inside the same node image used by the worker so native modules match.
# build:packages also triggers copy-assets which writes docker-compose-dev.yml
# to sdk/cli/dist/assets/docker/ — required for the cleanup compose call above.
print "Installing dependencies and building packages..."
docker run --rm \
  -v "$(pwd):/app" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e CI=1 \
  -w /app \
  node:24.13.0-slim sh -c "corepack enable && pnpm install --frozen-lockfile && npm run build:packages"

# Step 2: build the API docker image (same as npm run dev:build:api)
print "Building API docker image..."
docker build -f ops/api.Dockerfile -t outputai/api:dev . --quiet

# Step 3: start services via the CLI in detached mode.
# --detached runs `docker compose up -d` and exits immediately, so the
# CLI's 120s health-wait timeout is never reached and containers keep
# running for our own readiness polling below.
print "Starting dev environment..."
"$CLI" dev --detached --image-pull-policy missing

# Wait for the worker to become healthy and the catalog to be registered.
# The API depends on service_healthy for the worker, so it won't start until
# the worker is ready — meaning workflow list also gates API availability.
# In CI this typically takes 3-5 minutes total.
print "Waiting for worker to connect (polling via CLI workflow list)..."
MAX_ATTEMPTS=200
ATTEMPT=0
until "$CLI" workflow list > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    print "TIMEOUT: Worker did not connect after $((MAX_ATTEMPTS * 3))s" "✗"
    echo "--- worker logs ---"
    docker compose -f "$COMPOSE_FILE" --project-directory "$(pwd)" \
      logs worker --tail 200 2>/dev/null || true
    exit 1
  fi
  sleep 3
done
print "Worker connected and catalog available (after $((ATTEMPT * 3))s)"

# Phase 3: run the simple workflow using the CLI — pure math, no LLM required.
# Worker is already connected so this completes in a few seconds.
# --format json outputs the API response body prefixed with a log line;
# awk strips everything before the opening '{' before piping to jq.
print "Running 'simple' workflow with input [1, 2, 3, 4, 5]..."
CLI_OUTPUT=$("$CLI" workflow run simple \
  --input '{"values":[1,2,3,4,5]}' \
  --format json) || {
  print "Workflow run failed — dumping logs" "✗"
  docker compose -f "$COMPOSE_FILE" --project-directory "$(pwd)" \
    logs --tail 200 2>/dev/null || true
  exit 1
}
echo "Output: $CLI_OUTPUT"

RESULT=$(echo "$CLI_OUTPUT" | awk '/^\{/,0' | jq -r '.output.result')
if [ "$RESULT" = "15" ]; then
  print "PASSED: simple workflow returned result=15" "✓"
else
  print "FAILED: expected result=15, got result=$RESULT" "✗"
  exit 1
fi
