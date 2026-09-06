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

export UNIYRA_DATA_DIR="${data_root}"
export PORT="${port}"
exec node scripts/push/railway-run.mjs
