#!/bin/bash

# Publish each package to NPM

set -e

cd "${0%/*}/.."

tag=${1:-"latest"}

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "Publishing packages to NPM" "Run"

print "Installing"
pnpm install --frozen-lockfile

print "Building"
npm run build:packages

print "Publishing"
npm_config_loglevel=warn pnpm publish -r --no-git-checks --tag=$tag --report-summary

print "Publication Complete" "OK"
