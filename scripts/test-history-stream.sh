#!/usr/bin/env bash
set -euo pipefail

INCLUDE_PAYLOADS=false
LAST_EVENT_ID=""
RUN_ID=""

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --include-payloads) INCLUDE_PAYLOADS=true; shift ;;
    --run-id)           RUN_ID="$2"; shift 2 ;;
    --last-event-id)    LAST_EVENT_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

WORKFLOW_ID="${1:?Usage: $0 [--include-payloads] [--run-id <rid>] [--last-event-id <n>] <workflow-id>}"
BASE_URL="${OUTPUT_API_URL:-http://localhost:3001}"

if [[ -n "$RUN_ID" ]]; then
  ENDPOINT="${BASE_URL}/workflow/${WORKFLOW_ID}/runs/${RUN_ID}/history/stream"
else
  ENDPOINT="${BASE_URL}/workflow/${WORKFLOW_ID}/history/stream"
fi

PARAMS="includePayloads=${INCLUDE_PAYLOADS}"
[[ -n "$LAST_EVENT_ID" ]] && PARAMS="${PARAMS}&lastEventId=${LAST_EVENT_ID}"
URL="${ENDPOINT}?${PARAMS}"

echo "Connecting to ${URL}" >&2
echo "" >&2

format_events() {
  echo "$1" | jq -r --argjson payloads "$INCLUDE_PAYLOADS" '
    .[] |
    ([to_entries[] | select(.key | endswith("EventAttributes")) | .value] | first // {}) as $attrs |
    # results/outputs are wrapped by the Output runtime; unwrap to the inner value when present
    ( ( $attrs.result[0]? | objects | .output ) // $attrs.result ) as $result |
    "  [\(.eventId)] \(.eventTime) \(.eventTypeName)" +
    (if $attrs.stepName then " (\($attrs.stepName))" else "" end) +
    (if $attrs.scheduledEventId then " -> scheduled:[\($attrs.scheduledEventId)]" else "" end) +
    (if $payloads then
      (if $attrs.input != null then "\n        input:  \($attrs.input | tojson)" else "" end) +
      (if $result != null then "\n        result: \($result | tojson)" else "" end)
    else "" end)
  '
}

cur_event="" cur_data="" cur_id=""

while IFS= read -r line; do
  case "$line" in
    event:*) cur_event="${line#event: }" ;;
    data:*)  cur_data="${line#data: }" ;;
    id:*)    cur_id="${line#id: }" ;;
    :*)      ;; # keepalive comment
    "")
      [[ -z "$cur_event" ]] && continue
      case "$cur_event" in
        workflow)
          echo "=== Workflow ==="
          echo "$cur_data" | jq '{workflowId, runId, status, historyLength, taskQueue, startTime}'
          echo ""
          ;;
        history)
          count=$(echo "$cur_data" | jq 'length')
          echo "--- ${count} events (through id ${cur_id}) ---"
          format_events "$cur_data"
          echo ""
          ;;
        done)
          reason=$(echo "$cur_data" | jq -r '.reason')
          new_run=$(echo "$cur_data" | jq -r '.newRunId // empty')
          echo "=== Done: ${reason} ==="
          [[ -n "$new_run" ]] && echo "    continued as: ${new_run}"
          exit 0
          ;;
        server_error)
          echo "=== Server error ===" >&2
          echo "$cur_data" | jq . >&2
          exit 1
          ;;
      esac
      cur_event="" cur_data="" cur_id=""
      ;;
  esac
done < <(curl -sS -N -f \
  -H "Accept: text/event-stream" \
  "${URL}")
