#!/bin/bash

# Bump each package to a next prerelease version and update the CLI

set -e

cd "${0%/*}/.."

preid=$1

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[47;30m $sym \e[0m $1\n"
}

print "Bumping Prerelease" "Run"

if [[ -z "$preid" ]]; then ./ops/alert.sh "error" "Missing preid argument"; exit 1; fi

print "Bumping with $preid prerelease id"
update_cmd="v=\$(npm version prerelease --preid=${preid} --no-git-tag-version --allow-same-version --silent) && echo \"- \$PNPM_PACKAGE_NAME@\${v#v}\""
pnpm -r --include-workspace-root --filter "@outputai/*" --filter "output-api" exec sh -c "$update_cmd"

print "Set CLI SDK Version"
version=$(node -p "require('./sdk/core/package.json').version");
pnpm run --silent --filter @outputai/cli set-sdk-version $version

print "Packages bumped" "OK"
