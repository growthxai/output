#!/bin/bash

# Publish prod versions of the SDK packages to NPM.
# For each package in the sdk it will check if the package version is different from NPM.
# If it is, the script will publish the new version.

set -e

cd "${0%/*}"

count=0
print() {
  local sym=${2:-$((++count))}
  bg=$([[ $sym == "┗" ]] && echo "2" || echo "45" )
  fg=$([[ $sym == "┗" ]] && echo "35" || echo "30" )
  printf "\e[$bg;"$fg"m %s \e[0m %b\e[0m\n" "$sym" "$1"
}

print "Publishing SDK" "Run"

deploy() {
  path=$1

  print "Publishing $path"

  name=$(node -p "require('$path/package.json').name")
  local_version=$(node -p "require('$path/package.json').version")
  remote_version=$(pnpm view "$name@$local_version" version 2>/dev/null || echo "unpublished")

  if [[ $local_version == $remote_version ]]; then
    print "Ignoring $name, version $local_version is already published" "┗"
  else
    print "Publishing $name@$local_version" "┗"

    if ! output=$(cd "$path" && pnpm publish --no-git-checks 2>&1); then
      print "\e[0;31mFail:\n↓ ↓ ↓\n$(printf '%s\n' "$output" | grep -E '^ERR_PNPM' || true)\n↑ ↑ ↑" "┗"
      exit 1
    else
      print "\e[0;32mPublished" "┗"
    fi

  fi
}

# Dynamically find all SDK packages, ensuring framework is published last
PACKAGES=()
for dir in ../sdk/*/; do
  if [[ -d "$dir" && -f "$dir/package.json" && "$dir" != *"/framework/" ]]; then
    PACKAGES+=("$dir")
  fi
done
# Framework must be published last as it depends on the others
PACKAGES+=("../sdk/framework")

for path in "${PACKAGES[@]}"; do
  deploy "$path"
done

print "Publication Complete" "OK"
