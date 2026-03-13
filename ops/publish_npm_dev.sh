#!/bin/bash

# Publish dev versions of the SDK packages to NPM.
# This script will receive a pr_num and sha.
# For each package in the sdk it will check if the package is being bumped,
# this meaning the local version is different from the remote version.
# If it is, the script will use the pr_num and sha to create a dev version of the package and publish it to NPM.
set -e

cd "${0%/*}"

pr_num=$1
sha=$2

pub_list=()

count=0
print() {
  local sym=${2:-$((++count))}
  bg=$([[ $sym == "┗" ]] && echo "2" || echo "45" )
  fg=$([[ $sym == "┗" ]] && echo "35" || echo "30" )
  printf "\e[$bg;"$fg"m %s \e[0m %b\e[0m\n" "$sym" "$1"
}

print "Publishing Pre-release NPM packages" "Run"

if [[ -z "$pr_num" || -z "$sha" ]]; then
  print '\e[0;31mMissing required args: pr_num and sha\e[0m\n' "┗"
  exit 1
fi

deploy() {
  path=$1

  print "Publishing $path"

  name=$(node -p "require('$path/package.json').name")
  local_version=$(node -p "require('$path/package.json').version")

  base_version=$(echo "${local_version%%-dev.*}")
  local_dev_version="${base_version}-dev.pr${pr_num}-${sha}"

  remote_version=$(pnpm view "$name@$base_version" version 2>/dev/null || echo "unpublished")
  remote_dev_version=$(pnpm view "$name@$local_dev_version" version 2>/dev/null || echo "unpublished")

  print "\e[2;38mpkg=$name" "┗"
  print "\e[2;38mbase=$base_version" "┗"
  print "\e[2;38mlocal=$local_version" "┗"
  print "\e[2;38mlocal_dev=$local_dev_version" "┗"
  print "\e[2;38mremote=$remote_version" "┗"
  print "\e[2;38mremote_dev=$remote_dev_version" "┗"

  # No package bump
  if [[ $base_version == $remote_version ]]; then
    print "Ignoring $name, no version bump detected" "┗"

  # Dev version already published
  elif [[ $local_dev_version == $remote_dev_version ]]; then
    print "Ignoring $name, version $local_dev_version is already published" "┗"

  else
    # Maybe the version was already set locally, so no need to bump package.json
    if [[ $local_dev_version != $local_version ]]; then
      print "Bumping $name version to $local_dev_version" "┗"

      if ! output=$(cd "$path" && pnpm version "$local_dev_version" --no-git-tag-version 2>&1); then
        print "\e[0;31mFail:\n↓ ↓ ↓\n$output\n↑ ↑ ↑\n" "┗"
        exit 1
      fi
    fi

    print "Publishing $name" "┗"
    if ! output=$(cd "$path" && pnpm publish --tag dev --no-git-checks 2>&1); then
      print "\e[0;31mFail:\n↓ ↓ ↓\n$(printf '%s\n' "$output" | grep -E '^ERR_PNPM' || true)\n↑ ↑ ↑" "┗"
      exit 1
    else
      print "\e[0;32mPublished" "┗"
    fi

    pub_list+=("$name@$local_dev_version")
  fi
}

# Dynamically find all SDK packages, ensuring framework is published last
PACKAGES=()
for dir in ../sdk/*/; do
  if [[ -d "$dir" && -f "$dir/package.json" && "$dir" != *"/framework/" ]]; then
    PACKAGES+=("$dir")
  fi
done
# Framework must be published last as it depends on the others
PACKAGES+=("../sdk/framework")

for path in "${PACKAGES[@]}"; do
  deploy "$path"
done

print "Publication Complete" "OK"

# Output
echo "## Published packages"
for pkg in "${pub_list[@]}"; do
  echo "- $pkg"
done
