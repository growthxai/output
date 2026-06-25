#!/bin/bash

# Fails if the generated changelog (docs/guides/changelog/index.mdx) is empty or
# out of sync with docs/guides/data/releases.json. Guards against a silently
# empty changelog (OUT-490): the AUTO-GENERATED markers must be present and the
# number of <Update> blocks must match the number of releases.

set -euo pipefail

cd "${0%/*}/.."

page="docs/guides/changelog/index.mdx"
releases="docs/guides/data/releases.json"

grep -q '{/\* AUTO-GENERATED:START' "$page" || { echo "::error::Missing AUTO-GENERATED:START marker in $page"; exit 1; }
grep -q '{/\* AUTO-GENERATED:END \*/}' "$page" || { echo "::error::Missing AUTO-GENERATED:END marker in $page"; exit 1; }

expected=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).releases.length))' "$releases")
actual=$(grep -c '<Update label=' "$page" || true)

if [ "$expected" != "$actual" ]; then
  echo "::error::Changelog out of sync: $page has $actual <Update> blocks but $releases lists $expected releases. Run ./ops/regenerate_docs.sh and commit the result."
  exit 1
fi

echo "Changelog OK: $actual release entries match $releases."
