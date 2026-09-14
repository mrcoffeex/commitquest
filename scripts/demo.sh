#!/usr/bin/env bash
# Bot / simulate demo path: mock login, land commits, print the character.
set -euo pipefail
API="${API_URL:-http://localhost:3001}"

echo "== health =="
HEALTH=$(curl -sS "$API/api/health")
echo "$HEALTH"
echo "$HEALTH" | python3 -c 'import json,sys; cfg=json.load(sys.stdin); raise SystemExit(0 if cfg.get("authMock") else 1)' || {
  echo "AUTH_MOCK is false. The demo uses mock login + simulate (dev-only)."
  echo "Set AUTH_MOCK=true in .env, restart the API, and re-run npm run demo."
  exit 1
}

echo "== mock auth =="
TOKEN=$(curl -sS -X POST "$API/api/auth/mock" -H 'content-type: application/json' -d '{"login":"octocat"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
AUTH=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')

echo "== simulate commits (one includes node_modules noise) =="
curl -sS -X POST "$API/api/commits/simulate" "${AUTH[@]}" -d '{
  "additions": 80,
  "deletions": 12,
  "language": "TypeScript",
  "files": [
    {"filename":"src/xp.ts","additions":40,"deletions":6},
    {"filename":"src/hud.ts","additions":40,"deletions":6},
    {"filename":"node_modules/leftpad/index.js","additions":500,"deletions":0}
  ]
}'
echo
curl -sS -X POST "$API/api/commits/simulate" "${AUTH[@]}" -d '{"additions":20,"deletions":0,"language":"Python"}'
echo
curl -sS -X POST "$API/api/commits/simulate" "${AUTH[@]}" -d '{"additions":15,"deletions":1,"language":"Go"}'
echo

echo "== character / quests / leaderboard =="
curl -sS "$API/api/me" -H "authorization: Bearer $TOKEN"
echo
curl -sS "$API/api/quests" -H "authorization: Bearer $TOKEN"
echo
curl -sS "$API/api/leaderboard"
echo
echo "Demo path done. Open http://localhost:5173 and queue a solo duel vs CompileBot."
