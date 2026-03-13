#!/bin/bash

set -e

cd "${0%/*}/.."

git update-index --refresh > /dev/null || true
if ! git diff --quiet; then
  ./ops/print_warning.sh "warning" "Non-staged files detected."\
    "Either you left unstaged working files or automatic generated files were added after 'git add'. Files:\n$(git diff --name-only)"
fi
