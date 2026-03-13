#!/bin/bash

set -e

cd "${0%/*}/.."

count=0;
print(){
  sym=${2:-$((++count))}
  echo -e "\e[44;30m $sym \e[0m $1"
}

print "Validate" "Run"

print "Installing"
pnpm install --frozen-lockfile

print "Linting"
npm run lint --silent

print "Building"
npm run build:packages

print "Testing"
npm run test -- --silent passed-only

print "Validating docs"
npm run docs:validate

print "Validation Complete" "OK"
