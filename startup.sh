#!/usr/bin/env bash
set -euo pipefail
cd /home/site/wwwroot
export PYTHONPATH="/home/site/wwwroot/.python_packages/lib/site-packages${PYTHONPATH:+:$PYTHONPATH}"
exec python -m gunicorn --bind=0.0.0.0:8000 --workers=2 --timeout=60 "app:create_app()"
