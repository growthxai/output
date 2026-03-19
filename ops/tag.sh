#!/bin/bash

set -e

cd "${0%/*}/.."

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[46;30m $sym \e[0m $1\n"
}

print "Tagging version on Git" "Run"

version=$(node -p "require('./sdk/core/package.json').version")
tag="v${version}"

print "SDK version: ${version}"

remote_tag=$(git ls-remote --tags origin "refs/tags/$tag")

if [ -n "$remote_tag" ]; then
  print "Tag already exists" "Ok"
else
  print "Creating tag"
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git tag -fa "${tag}" -m "${tag}"
  git push origin "${tag}"
  print "Tag created" "Ok"
fi
