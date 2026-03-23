#!/bin/bash

# Bump each package to a next prerelease version (tied to commit SHA) and publish to npm

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[45;30m $sym \e[0m $1\n"
}

print "Publishing next packages to NPM" "Run"

SHORT_SHA=$(git rev-parse --short HEAD)

print "Bumping (next.$SHORT_SHA)"
update_cmd="v=\$(npm version prerelease --preid=next.\${SHORT_SHA} --no-git-tag-version --allow-same-version --silent) && echo \"- \$PNPM_PACKAGE_NAME@\${v#v}\""
SHORT_SHA=$SHORT_SHA pnpm -r --filter "@outputai/*" --filter "output-api" exec sh -c "$update_cmd"

print "Publishing"
npm_config_loglevel=warn pnpm publish -r --no-git-checks --tag=next --report-summary

print "Publication Complete" "OK"
