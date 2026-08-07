#!/bin/bash

set -eou pipefail

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "End-to-end tests" "Run"

export OUTPUT_API_URL="http://localhost:3001"
export OUTPUT_API_VERSION="dev"
export OUTPUT_WORKFLOWS_DIR="test_workflows"
export OUTPUT_TRACE_HOST_PATH="$(pwd)/test_workflows/logs"
export OUTPUT_TRACE_LOCAL_ON="true"

ERROR=""
cleanup() {
  local code=$?
  print "Tearing down..."
  docker compose -p output-sdk down -v --remove-orphans

  if [[ code -ne 0 ]]; then
    print "\e[31m${ERROR:-End-to-end test failed with exit code $code}" "Error"
  else
    print "Test passed" "OK"
  fi
  exit $code
}

trap cleanup EXIT

# Ensure .env exists (worker reads it via env_file in the compose)
if [ ! -f test_workflows/.env ]; then
  print "Creating minimal test_workflows/.env..."
  printf 'ANTHROPIC_API_KEY=dummy\nOPENAI_API_KEY=dummy\n' >test_workflows/.env
fi

# Install dependencies and build all SDK packages.
print "Installing and building..."
docker run --rm \
  -v "$(pwd):/app" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -w /app \
  node:24.15.0-slim sh -c "corepack enable && pnpm install --frozen-lockfile && npm run build:packages" | tail -n 25

# Build the API docker image.
print "Building API docker image..."
npm run build:api:dev

# Start services via the CLI in detached mode.
print "Starting dev environment..."
npm run dev:up -- --detached

# Run the simple workflow using the CLI since everything is up
print "Executing test workflow..."
OUT=$(npx --prefix=sdk/cli output workflow run e2e_test --input '{}' --json) || {
  if [ -n "${OUT:-}" ]; then
    printf '%s\n' "$OUT"
  fi
  ERROR="Workflow execution failed"
  exit 1
}

print "Test Workflow Output"
printf '%s\n' "$OUT"

# Matches the result against the expectation
PASSED=$(echo "$OUT" | jq -r '.output.passed')
if [ "$PASSED" != "true" ]; then
  ERROR="Workflow tests failed"
  exit 1
fi

exit 0
