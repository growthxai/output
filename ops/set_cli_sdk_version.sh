#!/bin/bash

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "Set CLI SDK Version" "Run"

version=$(node -p "require('./sdk/core/package.json').version");

pnpm run --silent --filter @outputai/cli set-sdk-version $version

print "Version set" "OK"
