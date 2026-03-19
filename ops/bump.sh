#!/bin/bash

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[43;30m $sym \e[0m $1\n"
}

print "Bumping Versions" "OK"

print "Evaluating changesets"
pnpm changeset version

print "Set CLI SDK Version"
version=$(node -p "require('./sdk/core/package.json').version");
pnpm run --silent --filter @outputai/cli set-sdk-version $version
print "Bumping finished" "Ok"
