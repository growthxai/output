#!/bin/bash

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[44;30m $sym \e[0m $1\n"
}

print "Generating Release" "Run"

version=$(cat ./version)
version=$(echo "$version" | tr -d '[:space:]')

print "Version: $version"

if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  ./ops/print_warning.sh "error" "Invalid version." "Content of the version file is not semver (found \"$version\")"
  exit 1
fi

print "Bumping workspace"
update_cmd="npm version \"$version\" --no-git-tag-version --allow-same-version --silent >/dev/null && echo \"- \$PNPM_PACKAGE_NAME: v$version\""
pnpm -r --include-workspace-root exec sh -c "$update_cmd"

print "Updating CLI version"
pnpm run --silent --filter @outputai/cli set-sdk-version $version

print "Release generated" "OK"
