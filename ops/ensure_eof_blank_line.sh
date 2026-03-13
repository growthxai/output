#!/bin/bash

# This script ensure all files end with a newline

set -e

# Sets up to be at the root folder
cd "${0%/*}/.."

# Check if the files is missing a blank line at the end
is_missing_newline() {
  # Ignore empty files
  [ -s "$1" ] || return 1
  # Compare last byte (hex) without emitting warnings/logs
  local last_hex=$(tail -c 1 "$1" | od -An -t x1 | tr -d ' \n')
  [ "$last_hex" != "0a" ]
}

# Starts with all files from the project that are not ignored by git
# Then, filters out those that intersect with files passed as arguments ($@)
# If no files are provided the list is not narrowed
# Finally, in the remaining files, exclude some common binaries.
files=$(find $(git ls-files -- "$@") -type f \
  -not -name "*.png" \
  -not -name "*.jpg" \
  -not -name "*.jpeg" \
  -not -name "*.gif" \
  -not -name "*.webp" \
  -not -name "*.ico" \
  -not -name "*.zip" \
  -not -name "*.gz" \
  -not -name "*.tgz" \
  -not -name "*.tar" 2>/dev/null || true) # ignores missing files*

# *git ls-files will return all files present on the branch, but if files were deleted and still not committed,
#  they would still be present in the list and the `find` command would fail. The /dev/null prevents that.

for path in $files; do
  # Add newline if missing
  if is_missing_newline "$path"; then
    printf "\e[2;34m ┗ \e[0m Adding missing empty line at EOF on $path\e[0m\n"
    echo "" >> "$path"
  fi
done
