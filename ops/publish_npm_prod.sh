#!/bin/bash

# Publish each package to NPM (if version is not published)

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "Publishing packages to NPM" "Run"

pnpm publish -r --no-git-checks

print "Publication Complete" "OK"
