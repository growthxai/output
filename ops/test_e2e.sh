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

ERROR=""
cleanup() {
  local code=$?
  print "Tearing down..."
  docker compose -p output-sdk down -v --remove-orphans

  if [[ code -eq 1 ]]; then
    print "\e[31m$ERROR" "Error"
  else
    print "Test passed" "OK"
  fi
  exit $code
}

trap cleanup EXIT

# Ensure .env exists (worker reads it via env_file in the compose)
if [ ! -f test_workflows/.env ]; then
  print "Creating minimal test_workflows/.env..."
  printf 'ANTHROPIC_API_KEY=dummy\nOPENAI_API_KEY=dummy\n' > test_workflows/.env
fi

# Install dependencies and build all SDK packages.
print "Installing and building..."
docker run --rm \
  -v "$(pwd):/app" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -w /app \
  node:24.13.0-slim sh -c "corepack enable && pnpm install --frozen-lockfile && npm run build:packages" | tail -n 25

# Build the API docker image.
print "Building API docker image..."
npm run dev:build:api

# Start services via the CLI in detached mode.
print "Starting dev environment..."
npm run dev:up -- --detached

# Run the simple workflow using the CLI since everything is up
print "Executing test workflow..."
CLI_OUTPUT=$(npm run --silent output -- workflow run simple --input '{"values":[1,2,3,4,5]}' --format json) || {
  printf "\e[36m\n[CLI output]\n\e[90m$CLI_OUTPUT\n"
  printf "\e[36m\n[Worker container tail]\n\e[90m...\n"
  docker compose -p output-sdk logs --no-color --no-log-prefix --tail 50 worker
  printf "\e[36m\n[API container tail]\n\e[90m...\n"
  docker compose -p output-sdk logs --no-color --no-log-prefix --tail 25 api | sed -r 's/\x1B\[[0-9;]*[mK]//g'
  printf "\e[0m"
  ERROR="Workflow execution failure"
  exit 1
}

# Matches the result against the expectation
EXPECT=15
RESULT=$(echo "$CLI_OUTPUT" | awk '/^\{/,0' | jq -r '.output.result')
if [ "$RESULT" != "$EXPECT" ]; then
  ERROR="Invalid workflow result, got $RESULT but was expecting $EXPECT"
  exit 1
fi

exit 0
