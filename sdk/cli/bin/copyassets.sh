#!/bin/bash
set -e

copyfiles './src/**/*.template' dist -u 1 --all

# native-copyfiles --all flag doesn't match dotfiles within ** globs
# (Node's fs.globSync excludes dotfiles by default), so copy them explicitly
find ./src -name '.*.template' -type f | while read -r file; do
  dest="dist/${file#./src/}"
  mkdir -p "$(dirname "$dest")"
  cp "$file" "$dest"
done
copyfiles './src/assets/**/*' dist -u 1
copyfiles './src/**/*.prompt' dist -u 1

echo "✅ Assets copied to dist/"
