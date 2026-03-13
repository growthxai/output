#!/bin/bash

set -e

cd "${0%/*}/.."

printf "\e[41;30m Run \e[0m Check extra files\n"

git config --global --add safe.directory "$(pwd)"
git update-index --refresh > /dev/null || true
if ! git diff --quiet; then
  ./ops/print_warning.sh "error" "Files were generated." "This indicates that generated files were added by the build:\n$(git diff --name-only)"
  exit 1
fi
