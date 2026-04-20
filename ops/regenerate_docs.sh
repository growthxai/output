#!/bin/bash

# Regenerates Mintlify MDX pages from docs/guides/data/releases.json.
#
# Called locally after hand-editing releases.json, and from the
# docs_regenerate GitHub workflow when a PR modifies the JSON.

set -e

cd "${0%/*}/.."

node docs/guides/scripts/regenerate.mjs
