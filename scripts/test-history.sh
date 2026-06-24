#!/usr/bin/env bash
set -euo pipefail

INCLUDE_PAYLOADS=false
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --include-payloads) INCLUDE_PAYLOADS=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

WORKFLOW_ID="${1:?Usage: $0 [--include-payloads] <workflow-id>}"
BASE_URL="${OUTPUT_API_URL:-http://localhost:3001}"
ENDPOINT="${BASE_URL}/workflow/${WORKFLOW_ID}/history"

PAGE_TOKEN=""
RUN_ID=""
PAGE=1

while true; do
  URL="${ENDPOINT}"
  PARAMS="includePayloads=${INCLUDE_PAYLOADS}"

  if [[ -n "$PAGE_TOKEN" ]]; then
    ENCODED_TOKEN=$(printf '%s' "$PAGE_TOKEN" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=''))")
    PARAMS="${PARAMS}&pageToken=${ENCODED_TOKEN}&runId=${RUN_ID}"
  fi

  URL="${URL}?${PARAMS}"

  echo "--- Page ${PAGE} ---"
  if ! RESPONSE=$(curl -sS --fail-with-body "${URL}"); then
    echo "Request failed:"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    exit 1
  fi

  # On first page, extract workflow metadata and runId
  if [[ $PAGE -eq 1 ]]; then
    echo "$RESPONSE" | jq '.workflow'
    RUN_ID=$(echo "$RESPONSE" | jq -r '.workflow.runId // empty')
    echo ""
  fi

  # Print events
  EVENT_COUNT=$(echo "$RESPONSE" | jq '.events | length')
  echo "${EVENT_COUNT} events:"
  echo "$RESPONSE" | jq -r '
    .events[] |
    # extract stepName and scheduledEventId from whichever attributes object exists
    ([to_entries[] | select(.key | endswith("EventAttributes")) | .value] | first // {}) as $attrs |
    "  [\(.eventId)] \(.eventTime) \(.eventTypeName)" +
    (if $attrs.stepName then " (\($attrs.stepName))" else "" end) +
    (if $attrs.scheduledEventId then " -> scheduled:[\($attrs.scheduledEventId)]" else "" end)
  '

  # Check for next page
  NEXT_TOKEN=$(echo "$RESPONSE" | jq -r '.nextPageToken // empty')
  if [[ -z "$NEXT_TOKEN" ]]; then
    echo ""
    echo "--- End of history ---"
    break
  fi

  PAGE_TOKEN="${NEXT_TOKEN}"
  PAGE=$((PAGE + 1))
  echo ""
done
