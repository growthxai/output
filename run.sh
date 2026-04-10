#!/bin/bash

# This is just a helper script to open a docker container and run node commands

set -e

check_docker_compose_version() {
  local required_version="2.24.0"
  local current_version
  current_version=$(docker compose version --short 2>/dev/null) || {
    echo "Error: Docker Compose is not installed. Please install Docker Compose."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
  }

  local current_major current_minor current_patch
  IFS='.' read -r current_major current_minor current_patch <<< "$current_version"

  local required_major required_minor required_patch
  IFS='.' read -r required_major required_minor required_patch <<< "$required_version"

  if [ "$current_major" -lt "$required_major" ] ||
     { [ "$current_major" -eq "$required_major" ] && [ "$current_minor" -lt "$required_minor" ]; } ||
     { [ "$current_major" -eq "$required_major" ] && [ "$current_minor" -eq "$required_minor" ] && [ "${current_patch%%[-+]*}" -lt "$required_patch" ]; }; then
    echo "Error: Docker Compose >=${required_version} is required (found v${current_version})."
    echo "Please update Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
  fi
}

cmd=$1

if [[ $cmd == 'validate' ]]; then
  # use full node image so we have git
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -w /app node:24.13.0 -c "corepack enable && ./ops/validate.sh"

# Expose docs at http://localhost/
elif [[ $cmd == 'docs:mint' ]]; then
  docker build -f ./ops/mint.Dockerfile -t mint .
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    -p 80:3000 \
    -w /app mint -c "cd ./docs/guides; mint dev"

elif [[ $cmd == 'dev' ]]; then
  check_docker_compose_version
  docker run -it --rm \
    -v $(pwd):/app \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -e CI=1 \
    -w /app node:24.13.0-slim sh -c "corepack enable && pnpm install --frozen-lockfile"
  docker compose -f ./docker-compose.dev.yml up

elif [[ $cmd == 'dev:destroy' ]]; then
  check_docker_compose_version
  docker compose -f ./docker-compose.dev.yml down -v

elif [[ $cmd == 'prod' ]]; then
  check_docker_compose_version
  docker compose -f ./docker-compose.prod.yml up --build

elif [[ $cmd == 'prod:destroy' ]]; then
  check_docker_compose_version
  docker compose -f ./docker-compose.prod.yml down -v

else
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    --network host \
    --env-file=.env \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -w /app node:24.13.0 -c "corepack enable && exec bash"
fi
