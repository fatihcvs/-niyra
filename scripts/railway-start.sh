#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_root="${UNIYRA_DATA_DIR:-/data}"
port="${PORT:-3000}"

mkdir -p "${data_root}" "${data_root}/wrangler"
export WRANGLER_WRITE_LOGS=false
export WRANGLER_LOG_PATH="${data_root}/wrangler/wrangler.log"
export MINIFLARE_REGISTRY_PATH="${data_root}/wrangler/registry"

cd "${project_root}"

./node_modules/.bin/wrangler d1 migrations apply DB \
  --config wrangler.railway.jsonc \
  --local \
  --persist-to "${data_root}"

exec ./node_modules/.bin/wrangler dev \
  --config wrangler.railway.jsonc \
  --local \
  --no-bundle \
  --persist-to "${data_root}" \
  --ip 0.0.0.0 \
  --port "${port}" \
  --log-level info \
  --show-interactive-dev-session false
