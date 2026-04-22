#!/bin/bash

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[43;30m $sym \e[0m $1\n"
}

print "Bumping Release" "Run"

from_version=$(node -p "require('./sdk/core/package.json').version")
to_version=$(./ops/get_bump.sh)

print "Building releases.json entry (v${from_version} -> v${to_version})"
node docs/guides/scripts/build_releases_json.mjs --from "$from_version" --to "$to_version"

print "Applying changeset version bump"
pnpm changeset version

print "Regenerating docs from releases.json"
./ops/regenerate_docs.sh

print "Set CLI SDK Version"
version=$(node -p "require('./sdk/core/package.json').version");
pnpm run --silent --filter @outputai/cli set-sdk-version $version

print "Packages bumped" "OK"
