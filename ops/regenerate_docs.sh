#!/bin/bash

# Regenerates Mintlify MDX snippets from docs/guides/data/releases.json.

set -e

cd "${0%/*}/.."

node docs/guides/scripts/regenerate.mjs
