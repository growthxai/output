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
CLI_OUTPUT=$(npx --prefix=sdk/cli output workflow run simple --input '{"values":[1,2,3,4,5]}' --json) || {
  printf "\e[36m\n[CLI output]\n\e[90m$CLI_OUTPUT\n"
  printf "\e[36m\n[Worker container tail]\n\e[90m...\n"
  docker compose -p output-sdk logs --no-color --no-log-prefix --tail 50 worker | sed -r 's/\x1B\[[0-9;]*[mK]//g'
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

# The local trace writer runs asynchronously, so wait briefly for the trace returned by the API.
print "Validating workflow trace..."
WORKFLOW_ID=$(echo "$CLI_OUTPUT" | awk '/^\{/,0' | jq -r '.workflowId')
TRACE_FILE=$(echo "$CLI_OUTPUT" | awk '/^\{/,0' | jq -r '.trace.local // empty')
if [ -z "$TRACE_FILE" ]; then
  ERROR="Workflow result did not include a local trace path"
  exit 1
fi

for _ in {1..20}; do
  if [ -s "$TRACE_FILE" ]; then
    break
  fi
  sleep 0.5
done

if [ ! -s "$TRACE_FILE" ]; then
  ERROR="Workflow trace was not created at $TRACE_FILE"
  exit 1
fi

if ! jq -e --arg workflow_id "$WORKFLOW_ID" '
  .kind == "workflow" and
  .name == "simple" and
  .input == { "values": [1, 2, 3, 4, 5] } and
  .output == { "result": 15, "workflowId": $workflow_id } and
  ([.children[] | select(
    .kind == "step" and
    .name == "simple#sumValues" and
    .input == [1, 2, 3, 4, 5] and
    .output == 15
  )] | length == 1)
' "$TRACE_FILE" >/dev/null; then
  ERROR="Workflow trace at $TRACE_FILE did not contain the expected root and step"
  exit 1
fi

exit 0
