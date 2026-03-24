#!/bin/bash

# This is just a helper script to open a docker container and run node commands

set -e

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
  docker run -it --rm \
    -v $(pwd):/app \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -e CI=1 \
    -w /app node:24.13.0-slim sh -c "corepack enable && pnpm install --frozen-lockfile"
  docker compose -f ./docker-compose.dev.yml up

elif [[ $cmd == 'dev:destroy' ]]; then
  docker compose -f ./docker-compose.dev.yml down -v

elif [[ $cmd == 'prod' ]]; then
  docker compose -f ./docker-compose.prod.yml up --build

elif [[ $cmd == 'prod:destroy' ]]; then
  docker compose -f ./docker-compose.prod.yml down -v

else
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    --network host \
    --env-file=.env \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -w /app node:24.13.0 -c "corepack enable && exec bash"
fi
