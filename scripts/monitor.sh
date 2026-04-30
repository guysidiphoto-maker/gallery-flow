#!/usr/bin/env bash
# Live monitor for an event gallery — designed to be run during a live shoot
# so the photographer can watch publish + face-indexing progress without
# touching DevTools or knowing SQL.
#
# Usage:
#   ./scripts/monitor.sh                # most recently created live gallery
#   ./scripts/monitor.sh <gallery_id>   # specific gallery by UUID
#   ./scripts/monitor.sh --once         # one-shot, no refresh loop
#
# Refreshes every 10 seconds. Reads .env.production for the API key, so it
# works straight out of the gallery-flow repo with no extra setup.

set -euo pipefail

cd "$(dirname "$0")/.."

# ─── Config ─────────────────────────────────────────────────────────────────

SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' .env.production | cut -d= -f2-)
ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env.production | cut -d= -f2-)
REFRESH_SECONDS=10

if [[ -z "$SUPABASE_URL" || -z "$ANON_KEY" ]]; then
  echo "Could not read Supabase URL/key from .env.production"
  exit 1
fi

# ─── Args ────────────────────────────────────────────────────────────────────

GALLERY_ID=""
ONCE=0
for arg in "$@"; do
  case "$arg" in
    --once) ONCE=1 ;;
    --help|-h)
      echo "Usage: $0 [gallery_id] [--once]"
      exit 0
      ;;
    *) GALLERY_ID="$arg" ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Resolve the gallery to watch. With no argument, picks the most recently
# created gallery whose status is 'live' — the one a live-event photographer
# would actually care about.
resolve_gallery() {
  if [[ -n "$GALLERY_ID" ]]; then
    echo "$GALLERY_ID"
    return
  fi
  curl -s "$SUPABASE_URL/rest/v1/galleries?select=id&status=eq.live&order=created_at.desc&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['id'] if rows else '')"
}

# Fetch a single render of the gallery's state and pretty-print it.
render() {
  local gid="$1"
  local now
  now=$(date '+%H:%M:%S')

  if [[ -z "$gid" ]]; then
    echo "No live gallery found. Pass a gallery id explicitly: $0 <gallery_id>"
    return
  fi

  local raw
  raw=$(curl -s "$SUPABASE_URL/rest/v1/galleries?id=eq.$gid&select=name,status,publish_status,face_index_enabled,face_index_status,face_indexed_count,image_count,face_index_error,face_indexed_at,published_at,delivery_settings" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")

  if [[ -z "$raw" || "$raw" == "[]" ]]; then
    echo "Gallery $gid not found"
    return
  fi

  # Count actually-uploaded image rows + actually-indexed rows. The gallery
  # row's image_count and face_indexed_count are eventually-consistent and
  # can drift; the live count from the images table is the truth.
  local actual_total actual_indexed actual_originals_done
  actual_total=$(curl -s -o /dev/null -D - \
    "$SUPABASE_URL/rest/v1/images?gallery_id=eq.$gid&select=id&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Prefer: count=exact" \
    | grep -i 'content-range:' | sed 's:.*/::' | tr -d '\r\n')
  actual_indexed=$(curl -s -o /dev/null -D - \
    "$SUPABASE_URL/rest/v1/images?gallery_id=eq.$gid&face_indexed_at=not.is.null&select=id&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Prefer: count=exact" \
    | grep -i 'content-range:' | sed 's:.*/::' | tr -d '\r\n')
  actual_originals_done=$(curl -s -o /dev/null -D - \
    "$SUPABASE_URL/rest/v1/images?gallery_id=eq.$gid&original_uploaded=eq.true&select=id&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Prefer: count=exact" \
    | grep -i 'content-range:' | sed 's:.*/::' | tr -d '\r\n')

  python3 - "$raw" "$actual_total" "$actual_indexed" "$actual_originals_done" "$now" "$gid" <<'PY'
import sys, json
from datetime import datetime, timezone

raw, actual_total, actual_indexed, actual_originals, now_clock, gid = sys.argv[1:7]
g = json.loads(raw)[0]

# ANSI helpers
RESET = '\033[0m'
DIM = '\033[2m'
BOLD = '\033[1m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
RED = '\033[31m'
BLUE = '\033[36m'

def color_status(s):
    if s == 'live': return f'{GREEN}{s}{RESET}'
    if s == 'publishing': return f'{YELLOW}{s}{RESET}'
    if s == 'failed': return f'{RED}{s}{RESET}'
    return f'{DIM}{s}{RESET}'

def color_face(s):
    if s == 'done': return f'{GREEN}{s}{RESET}'
    if s == 'indexing': return f'{YELLOW}{s}{RESET}'
    if s == 'failed': return f'{RED}{s}{RESET}'
    return f'{DIM}{s or "—"}{RESET}'

def fmt_age(iso):
    if not iso: return '—'
    try:
        # Strip microseconds if very long, keep timezone
        t = datetime.fromisoformat(iso.replace('Z', '+00:00'))
        delta = datetime.now(timezone.utc) - t
        secs = int(delta.total_seconds())
        if secs < 60: return f'{secs}s ago'
        if secs < 3600: return f'{secs // 60}m {secs % 60}s ago'
        if secs < 86400: return f'{secs // 3600}h {(secs % 3600) // 60}m ago'
        return f'{secs // 86400}d ago'
    except Exception:
        return iso

privacy = (g.get('delivery_settings') or {}).get('faceRecognition', '—')

# Try int conversion for counts; treat '*' or missing as 0
def to_int(x):
    try: return int(x)
    except: return 0

at = to_int(actual_total)
ai = to_int(actual_indexed)
ao = to_int(actual_originals)
total = max(at, to_int(g.get('image_count')))
pct_idx = (100 * ai // total) if total else 0
pct_orig = (100 * ao // total) if total else 0

# Stall detection: face_indexed_at not advancing during indexing
last_indexed_at = g.get('face_indexed_at')
stalled_warning = ''
if g.get('face_index_status') == 'indexing' and last_indexed_at:
    try:
        t = datetime.fromisoformat(last_indexed_at.replace('Z', '+00:00'))
        secs = int((datetime.now(timezone.utc) - t).total_seconds())
        if secs > 12 * 60:
            stalled_warning = f'{RED}STALLED — no progress in {secs // 60} min, auto-resume should fire{RESET}'
        elif secs > 5 * 60:
            stalled_warning = f'{YELLOW}slow — no progress in {secs // 60} min{RESET}'
    except Exception:
        pass

# Compose
print()
print(f'{BOLD}━━ {g.get("name", "(unnamed)")} {DIM}{gid[:8]}…{RESET}{BOLD}  ━━{RESET}  {DIM}{now_clock}{RESET}')
print()
print(f'  {DIM}gallery status      {RESET} {color_status(g.get("status"))}')
print(f'  {DIM}publish status      {RESET} {g.get("publish_status") or "—"}')
print(f'  {DIM}face mode           {RESET} {privacy}')
print(f'  {DIM}face indexing       {RESET} {color_face(g.get("face_index_status"))}')
print()
print(f'  {DIM}images uploaded     {RESET} {at}/{total}')
print(f'  {DIM}faces indexed       {RESET} {ai}/{total}  {DIM}({pct_idx}%){RESET}')
print(f'  {DIM}HD originals ready  {RESET} {ao}/{total}  {DIM}({pct_orig}%){RESET}')
print()
if g.get('face_index_error'):
    print(f'  {RED}error{RESET}               {g["face_index_error"][:80]}')
print(f'  {DIM}last indexed change {RESET} {fmt_age(last_indexed_at)}')
if stalled_warning:
    print(f'  {stalled_warning}')
PY
}

# ─── Loop ────────────────────────────────────────────────────────────────────

GALLERY_ID=$(resolve_gallery)

if [[ "$ONCE" == "1" ]]; then
  render "$GALLERY_ID"
  exit 0
fi

# Continuous mode — clear screen, render, sleep, repeat. Ctrl-C to exit.
trap 'echo; echo "Stopped."; exit 0' INT
while true; do
  clear
  render "$GALLERY_ID"
  echo
  echo "  Refreshing every ${REFRESH_SECONDS}s — Ctrl-C to stop"
  sleep "$REFRESH_SECONDS"
done
