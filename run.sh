#!/bin/bash

# This is just a helper script to open a docker container and run node commands

set -e

cmd=$1

if [[ $cmd == 'validate' ]]; then
  # use full node image so we have git
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -w /app node:24.15.0 -c "corepack enable && ./ops/validate.sh"

# Expose docs at http://localhost/
elif [[ $cmd == 'docs:mint' ]]; then
  docker build -f ./ops/mint.Dockerfile -t mint .
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    -p 80:3000 \
    -w /app mint -c "cd ./docs/guides; mint dev"

elif [[ $cmd == 'dev' ]]; then
  printf "\e[1;35m\nStarting development environment\e[0m\n\n"

  temporal_address=$(sed -n 's/^TEMPORAL_ADDRESS=//p' .env 2>/dev/null | tail -n 1)
  if [[ -n $temporal_address ]]; then
    printf "\e[0;33mUsing remote Temporal. TEMPORAL_ADDRESS found in .env, API and worker will connect to \"%s\" with TEMPORAL_API_KEY, TEMPORAL_NAMESPACE vars. Local Temporal still runs, but is unused.\e[0m\n\n" "$temporal_address"
  else
    printf "\e[2mUsing local Temporal. Set TEMPORAL_ADDRESS, TEMPORAL_API_KEY, TEMPORAL_NAMESPACE at .env to connect the API and worker to a remote server.\e[0m\n\n"
  fi

  docker compose -f ./docker-compose.yml up

elif [[ $cmd == 'dev:destroy' ]]; then
  docker compose -f ./docker-compose.yml down -v

else
  docker run -it --rm --entrypoint bash \
    -v $(pwd):/app \
    --network host \
    --env-file=.env \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -w /app node:24.15.0 -c "corepack enable && exec bash"
fi
