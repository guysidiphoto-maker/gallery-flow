#!/usr/bin/env bash
# Reconcile original_uploaded flag for a gallery.
#
# Usage:
#   ./scripts/reconcile-originals.sh <gallery_id>
#
# Walks every image row for the gallery. For each row where
# original_uploaded=false but original_path is set, HEAD-checks the
# storage URL. If the file is actually there, flips the flag to true.
#
# Use this if a gallery's HD downloads aren't unlocking even though
# the upload completed (e.g. transient DB write failures during a
# 3000-photo upload). Idempotent — safe to re-run.
#
# Reads .env.production for credentials.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <gallery_id>"
  exit 1
fi

GALLERY_ID="$1"

SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' .env.production | cut -d= -f2-)
ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env.production | cut -d= -f2-)

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "Could not read Supabase URL/key from .env.production"
  exit 1
fi

# Service role key is needed to bypass RLS for the bulk update.
# Falls back to anon key if not set; bulk update may fail under RLS.
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$ANON_KEY}"

echo "Fetching images for gallery $GALLERY_ID..."

ROWS=$(curl -s \
  "$SUPABASE_URL/rest/v1/images?gallery_id=eq.$GALLERY_ID&original_uploaded=eq.false&select=id,filename,original_path&limit=10000" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY")

TOTAL=$(echo "$ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Found $TOTAL images with original_uploaded=false"

if [[ "$TOTAL" == "0" ]]; then
  echo "Nothing to reconcile."
  exit 0
fi

# Walk each row, HEAD-check storage, collect IDs that exist
TO_FLIP=$(echo "$ROWS" | python3 - "$SUPABASE_URL" <<'PY'
import sys, json, urllib.request, urllib.error
base = sys.argv[1]
rows = json.load(sys.stdin)
flip = []
for i, r in enumerate(rows):
    path = r.get('original_path')
    if not path:
        continue
    url = f"{base}/storage/v1/object/public/gallery-images/{path}"
    req = urllib.request.Request(url, method='HEAD')
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                flip.append(r['id'])
                print(f"  ✓ exists: {r['filename']}", file=sys.stderr)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        print(f"  ✗ missing: {r['filename']}", file=sys.stderr)
    if (i+1) % 50 == 0:
        print(f"  …checked {i+1}/{len(rows)}", file=sys.stderr)
print(json.dumps(flip))
PY
)

COUNT=$(echo "$TO_FLIP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo
echo "Found $COUNT files actually in storage. Flipping flag..."

if [[ "$COUNT" == "0" ]]; then
  echo "No files to flip."
  exit 0
fi

# PATCH each row in batches via PostgREST
echo "$TO_FLIP" | python3 - "$SUPABASE_URL" "$SERVICE_KEY" <<'PY'
import sys, json, urllib.request
base, key = sys.argv[1], sys.argv[2]
ids = json.load(sys.stdin)
# PATCH with ?id=in.(uuid1,uuid2,...) — PostgREST format
chunk_size = 50
for i in range(0, len(ids), chunk_size):
    chunk = ids[i:i+chunk_size]
    in_clause = ','.join(chunk)
    url = f"{base}/rest/v1/images?id=in.({in_clause})"
    req = urllib.request.Request(
        url,
        data=json.dumps({"original_uploaded": True}).encode(),
        method='PATCH',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        print(f"  flipped {len(chunk)} rows ({i+len(chunk)}/{len(ids)})")
    except Exception as e:
        print(f"  FAILED batch starting at {i}: {e}")
PY

echo
echo "Done. Re-run scripts/monitor.sh $GALLERY_ID to verify HD originals count."
