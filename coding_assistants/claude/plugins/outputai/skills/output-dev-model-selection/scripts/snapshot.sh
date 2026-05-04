#!/usr/bin/env bash
# Fetch the latest 10 models per provider (anthropic, openai, google) from the
# Vercel AI Gateway. Output is JSON of shape:
#   { "anthropic": [ <model>, ... ], "openai": [...], "google": [...] }
# Each <model> is the unmodified payload from the gateway — id, released, name,
# description, context_window, max_tokens, type, tags, pricing — preserved as-is.
set -euo pipefail

curl -s https://ai-gateway.vercel.sh/v1/models | jq '
  .data as $models
  | {
      anthropic: ([ $models[] | select(.id | startswith("anthropic/")) ] | sort_by(.released) | reverse | .[0:10]),
      openai:    ([ $models[] | select(.id | startswith("openai/"))    ] | sort_by(.released) | reverse | .[0:10]),
      google:    ([ $models[] | select(.id | startswith("google/"))    ] | sort_by(.released) | reverse | .[0:10])
    }
'
