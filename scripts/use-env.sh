#!/usr/bin/env bash
# Switch the local .env between staging and production.
# Usage: ./scripts/use-env.sh staging   |   ./scripts/use-env.sh production
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:-}"
case "$target" in
  staging)
    cp .env.staging .env
    echo "✓ Switched to STAGING (bkccdomovxtuqdxrahnc) — safe for testing"
    ;;
  production)
    cp .env.production .env
    echo "⚠ Switched to PRODUCTION (vlyiqfawkrjvqcmkpfvs) — real client data"
    ;;
  *)
    echo "Usage: $0 {staging|production}"
    echo ""
    echo "Currently active:"
    grep -E "^VITE_SUPABASE_URL" .env || echo "(no .env)"
    exit 1
    ;;
esac
