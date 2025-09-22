#!/usr/bin/env bash
set -euo pipefail

# Short script to run the COG CLI against the example models
# Usage:
#   ./generate.sh [--schema public --no-postgis ...]
#
# Env overrides:
#   MODELS_PATH (default: ./models)
#   OUTPUT_PATH (default: ./generated)
#   DB_TYPE     (default: postgresql)

# Resolve paths
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# Defaults (can be overridden by env)
MODELS_PATH="${MODELS_PATH:-${SCRIPT_DIR}/models}"
OUTPUT_PATH="${OUTPUT_PATH:-${SCRIPT_DIR}/generated}"
DB_TYPE="${DB_TYPE:-postgresql}"

echo "Running COG generator via CLI"
echo "Models:   ${MODELS_PATH}"
echo "Output:   ${OUTPUT_PATH}"
echo "DB type:  ${DB_TYPE}"
echo

# Forward any extra args to the CLI (e.g., --schema, --no-postgis, etc.)
 deno run -A "${REPO_ROOT}/src/cli.ts" \
  --modelsPath "${MODELS_PATH}" \
  --outputPath "${OUTPUT_PATH}" \
  --dbType "${DB_TYPE}" \
  "$@"
