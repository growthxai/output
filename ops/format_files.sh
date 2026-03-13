#!/bin/bash

# Format a list of files (lint + new lines)
set -e

cd "${0%/*}/.."

count=0;
print(){
  sym=${2:-$((++count))}
  echo -e "\e[44;30m $sym \e[0m $1"
}

print "Format files" "Run"

print "Linting"
npm run lint:fix --silent --no-warn-ignored $@

print "Ensuring EOF blank line"
./ops/ensure_eof_blank_line.sh $@

print "Format files" "OK"
