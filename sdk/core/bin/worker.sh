#!/bin/bash

set -e

invocation_dir="$(pwd)"

# Follow symlinks to get the real script path
if [ -L "${BASH_SOURCE[0]}" ]; then
  real_script="$(readlink "${BASH_SOURCE[0]}")"
  # If relative path, resolve from symlink directory
  if [[ "$real_script" != /* ]]; then
    real_script="$(dirname "${BASH_SOURCE[0]}")/$real_script"
  fi
else
  real_script="${BASH_SOURCE[0]}"
fi

# Get the real script directory (should be node_modules/<pkg>/bin)
script_dir="$(cd "$(dirname "$real_script")" && pwd)"

# SDK dir is the parent (node_modules/output-core)
sdk_dir="$(dirname "$script_dir")"

cd ${sdk_dir}

# Route `output-worker --check` (or OUTPUT_WORKER_CHECK=1) to the bundle-check entry,
# which validates the workflow bundle without a Temporal connection or worker config.
if [[ " $* " == *" --check "* || "${OUTPUT_WORKER_CHECK}" == "1" || "${OUTPUT_WORKER_MODE}" == "check" ]]; then
  exec node "${sdk_dir}/src/worker/check.js" "${invocation_dir}"
fi

exec node "${sdk_dir}/src/worker/index.js" "${invocation_dir}" "${@:2}"
