#!/bin/zsh

set -eu

build_dir="$HOME/.local/share/xiaobu-pet-task-overlay"
source_file="$build_dir/main.swift"
binary="$build_dir/PetTaskOverlay"

mkdir -p "$build_dir"
if [[ ! -f "$source_file" ]]; then
  echo "PetTaskOverlay source is missing: run scripts/install-pet-task-overlay.sh once." >&2
  exit 1
fi
if [[ ! -x "$binary" || "$source_file" -nt "$binary" ]]; then
  /usr/bin/xcrun swiftc -framework AppKit "$source_file" -o "$binary"
fi
exec "$binary"
