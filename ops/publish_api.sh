#!/bin/bash

# Build and publish the API image to Dockerhub

set -e
cd "${0%/*}"

dry_run=false
no_aliases=false

count=0
print() {
  sym=${2:-$((++count))}
  printf "\e[44;30m $sym \e[0m $1\n"
}

# Check if tag exists on docker hub
is_tag_already_pushed() {
  local tag=$1
  has_404_message="$(docker run --rm curlimages/curl:8.17.0 -s "https://hub.docker.com/v2/repositories/${image_name}/tags/${tag}" | grep "httperror 404" )"
  [[ -z "$has_404_message" ]] && return 0 || return 1;
}

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    --no-aliases) no_aliases=true ;;
    *) ./alert.sh "error" "Unknown argument" "$arg"; exit 1 ;;
  esac
done

print "Publish API Image" "Run"

# Print argument details
if [[ "$no_aliases" == true ]]; then printf "\e[0;90mUsing --no-aliases, skipping ":latest", ":x" and ":x.x" aliases creation\e[0m\n"; fi
if [[ "$dry_run" == true ]]; then printf "\e[0;90mUsing --dry-run, skipping actual docker push\e[0m\n"; fi

if [[ -z "$DOCKERHUB_USERNAME" || -z "$DOCKERHUB_TOKEN" ]]; then ./alert.sh "error" "Missing env vars" "DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"; exit 1; fi

image_name=$DOCKERHUB_USERNAME/api
version=$(cat ../api/package.json | grep \"version\" | cut -d'"' -f 4)

print "API Image tag: $version"

print "Authenticating with Dockerhub"
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin

print "Checking if tag is already pushed"
if is_tag_already_pushed "$version"; then
  print "Tag $version is already pushed" "Done"
  exit 0
fi

print "Building image"
if [[ $no_aliases == false ]]; then
  # Parse semver components
  IFS='.' read -r major minor _patch <<< "$version"
  docker build ../ --file ./api.Dockerfile -t "$image_name:$version" -t "$image_name:$major" -t "$image_name:$major.$minor" -t "$image_name:latest"
else
  docker build ../ --file ./api.Dockerfile -t "$image_name:$version"
fi

print "Publishing"
if [[ "$dry_run" == true ]]; then printf "\e[0;33mDry run mode, skipping\n"; else docker push --all-tags $image_name; fi

print "Publish Complete" "OK"
