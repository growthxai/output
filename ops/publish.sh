#!/bin/bash

set -e

./ops/validate.sh
./ops/publish_npm_prod.sh
./ops/publish_api_image.sh
