#!/usr/bin/env bash
# verify-blocker2-ai-auth.sh — prove the AI/cost endpoints reject unauthenticated
# and bad-token callers BEFORE any paid Anthropic call.
#
# SAFE TO RUN against a Preview deploy or prod: every expected response is a
# 401/403 that fires before the AI call, so it costs nothing. (Do NOT add a
# valid-token happy-path here — that WOULD spend tokens.)
#
# Usage:  BASE_URL="https://<preview>.vercel.app" bash scripts/verify-blocker2-ai-auth.sh
#         (defaults to http://localhost:3000 if BASE_URL unset)
#
# The no-Origin case is the key regression test: pre-fix, a request with no
# Origin/Referer header SKIPPED the gate entirely and reached the AI call.
# Post-fix it must return 401 auth_required.

set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
FAKE_CLIENT="00000000-0000-0000-0000-000000000000"
PASS=0; FAIL=0

check() {
  local name="$1" expected="$2" got="$3" bodysnip="$4"
  if [ "$got" = "$expected" ]; then
    echo "  PASS  $name → $got"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name → got $got, expected $expected  | body: ${bodysnip:0:120}"
    FAIL=$((FAIL+1))
  fi
}

post() { # url, json, [extra curl args...]
  local url="$1"; shift
  local json="$1"; shift
  curl -s -o /tmp/b2body -w "%{http_code}" -X POST "$url" \
    -H 'Content-Type: application/json' "$@" -d "$json"
}

echo "Target: $BASE_URL"
echo

# clientId endpoints — expect 401 with NO auth header (incl. no-Origin bypass test)
for ep in score-images generate-feed generate-campaign plan-event; do
  body='{"clientId":"'"$FAKE_CLIENT"'","galleryId":"'"$FAKE_CLIENT"'","brief":{}}'

  code=$(post "$BASE_URL/api/$ep" "$body")                       # no Origin, no auth
  check "$ep  (no-Origin, no-auth → 401)" 401 "$code" "$(cat /tmp/b2body)"

  code=$(post "$BASE_URL/api/$ep" "$body" -H "Origin: $BASE_URL") # spoofed Origin, no auth
  check "$ep  (good-Origin, no-auth → 401)" 401 "$code" "$(cat /tmp/b2body)"

  code=$(post "$BASE_URL/api/$ep" "$body" -H "Authorization: Bearer not.a.real.jwt")
  check "$ep  (bad token → 401)" 401 "$code" "$(cat /tmp/b2body)"
done

# generate-captions — requires a valid session (any authed user); free-text only.
cap='{"photos":[{"eventType":"event","galleryName":"x","filename":"y"}],"language":"he"}'
code=$(post "$BASE_URL/api/generate-captions" "$cap" -H "Origin: $BASE_URL")
check "generate-captions  (good-Origin, no-auth → 401)" 401 "$code" "$(cat /tmp/b2body)"
code=$(post "$BASE_URL/api/generate-captions" "$cap" -H "Origin: $BASE_URL" -H "Authorization: Bearer not.a.real.jwt")
check "generate-captions  (bad token → 401)" 401 "$code" "$(cat /tmp/b2body)"

echo
echo "RESULT: $PASS passed, $FAIL failed"
echo
echo "MANUAL (needs a real session — do once, it WILL spend ~1 AI call):"
echo "  • valid token + a clientId from ANOTHER business → expect 403 forbidden (cross-tenant denied)"
echo "  • valid token + your OWN clientId → expect 200 (happy path still works)"
[ "$FAIL" -eq 0 ]
