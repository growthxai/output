#!/bin/bash

# Bump each package to a prerelease version and publish to npm

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "Publishing dev packages to NPM" "Run"

print "Bumping"
update_cmd='v=$(npm version prerelease --preid=dev --no-git-tag-version --allow-same-version --silent) && echo "- $PNPM_PACKAGE_NAME@${v#v}"'
pnpm -r --include-workspace-root exec sh -c "$update_cmd"

print "Publishing"
npm_config_loglevel=warn pnpm publish -r --no-git-checks --tag=dev --report-summary

print "Publication Complete" "OK"
