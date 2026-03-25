#!/bin/bash

set -e

cd "${0%/*}/.."

out_file=./changeset_status.json

pnpm changeset status --output="$out_file"
version=$(node -p "require( '$out_file' ).releases[0]?.newVersion ?? ''")
rm -f "$out_file"
echo "$version"
