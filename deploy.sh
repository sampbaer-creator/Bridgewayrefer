#!/usr/bin/env bash
set -euo pipefail
source_dir="${DEPLOYMENT_SOURCE:-$(pwd)}"
target_dir="${DEPLOYMENT_TARGET:-/home/site/wwwroot}"
test -d "$source_dir/.python_packages/lib/site-packages/azure"
test -f "$source_dir/startup.sh"
mkdir -p "$target_dir"
if [ "$(realpath "$source_dir")" != "$(realpath "$target_dir")" ]; then
  for entry in app.py notifications.py reporting.py requirements.txt startup.sh templates static .python_packages; do
    cp -R "$source_dir/$entry" "$target_dir/"
  done
fi
test -d "$target_dir/.python_packages/lib/site-packages/azure"
echo "Prepared application and Python dependencies copied successfully."
