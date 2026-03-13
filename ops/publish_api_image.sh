#!/bin/bash

set -e
cd "${0%/*}"

DRY=false
if [[ "$1" == "--dry" || "$1" == "--dry-run" ]]; then
  DRY=true
fi

if [[ "$DRY" == false ]] && [[ -z "$DOCKERHUB_USERNAME" || -z "$DOCKERHUB_TOKEN" ]]; then
  echo -e "\e[0;31mError: DOCKERHUB_USERNAME and DOCKERHUB_TOKEN must be set\e[0m" >&2
  exit 1
fi

NAME=api
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-your-username}"
IMAGE=$DOCKERHUB_USERNAME/$NAME

run() {
  if [[ "$DRY" == true ]]; then
    echo -e "\e[2m  \$ $*\e[0m"
  else
    "$@"
  fi
}

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[46;30m $sym \e[0m $1\n"
}

print "Publish API Image" "Run"

# Get local version from package.json
local_version=$(cat ../api/package.json | grep \"version\" | cut -d'"' -f 4)
print "Local version: $local_version"

# Parse semver components
IFS='.' read -r major minor _patch <<< "$local_version"
tags=("$local_version" "$major.$minor" "$major")

# Check which tags already exist on DockerHub
missing_tags=()
for tag in "${tags[@]}"; do
  print "Checking remote tag: $tag"
  remote_tag="$(docker run --rm curlimages/curl:8.17.0 -s "https://hub.docker.com/v2/repositories/${IMAGE}/tags/${tag}" | grep -oE '"name":"[^"]+"' | head -n1 | cut -d'"' -f4)"
  if [[ "$tag" == "$remote_tag" ]]; then
    print "  exists" "✓"
  else
    print "  not found" "✗"
    missing_tags+=("$tag")
  fi
done

if [[ ${#missing_tags[@]} -eq 0 ]]; then
  print "All tags already exist on DockerHub, skipping publish" "Skip"
  exit 0
fi

# Always push latest when the full version is new
full_version_missing=false
for tag in "${missing_tags[@]}"; do
  [[ "$tag" == "$local_version" ]] && full_version_missing=true
done
if [[ "$full_version_missing" == true ]]; then
  missing_tags+=("latest")
fi

print "Authentication with Dockerhub"
run sh -c "echo \"\$DOCKERHUB_TOKEN\" | docker login -u \"$DOCKERHUB_USERNAME\" --password-stdin"

print "Building"
run docker build ../ --file ./api.Dockerfile -t $IMAGE:latest

tag_and_push() {
  local tag=$1
  print "Tagging and publishing $tag"
  run docker tag $IMAGE:latest $IMAGE:$tag
  run docker push $IMAGE:$tag
}

for tag in "${missing_tags[@]}"; do
  tag_and_push "$tag"
done

print "Publish Complete" "OK"
