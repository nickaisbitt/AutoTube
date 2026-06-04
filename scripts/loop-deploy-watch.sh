#!/usr/bin/env bash
# Emits AGENT_LOOP_WAKE_DEPLOY when Railway deploy finishes or prod goes fresh.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

PROMPT='Keep working until AutoTube is 103% done: prod on latest master, /api/health fresh uptime, deploy.gitCommit set, app loads. Fix Railway build/deploy if FAILED.'
BUILDING_SINCE=""
MAX_BUILD_SEC=$((50 * 60))

while true; do
  read -r STATUS DEPLOY_ID <<< "$(node --input-type=module <<'NODE'
import { loadRailwayToken } from './scripts/lib/railway-token.mjs';
const token = loadRailwayToken();
if (!token) { console.log('NO_TOKEN none'); process.exit(0); }
const q = `query { deployments(input: { projectId: "283b075f-eb25-4a60-8468-a45d77e068bc", environmentId: "decad258-accb-49f1-a0e0-679568c883f6", serviceId: "5cf09f78-9182-4e95-8659-a999dc97e246" }, first: 1) { edges { node { id status createdAt } } } }`;
const n = (await (await fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q }),
})).json()).data?.deployments?.edges?.[0]?.node;
console.log((n?.status ?? 'UNKNOWN'), (n?.id ?? 'none'));
NODE
)"

  UPTIME=$(curl -sf --max-time 15 https://autotube-production.up.railway.app/api/health \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(Math.round(JSON.parse(d).uptime))}catch{console.log(999999999)}})" \
    || echo "999999999")

  NOW=$(date +%s)
  if [ "$STATUS" = "BUILDING" ]; then
    if [ -z "$BUILDING_SINCE" ]; then BUILDING_SINCE=$NOW; fi
    ELAPSED=$((NOW - BUILDING_SINCE))
    if [ "$ELAPSED" -ge "$MAX_BUILD_SEC" ]; then
      printf '%s\n' "AGENT_LOOP_WAKE_DEPLOY {\"prompt\":\"$PROMPT Deploy $DEPLOY_ID BUILDING >${MAX_BUILD_SEC}s — check logs, cancel stale, fix snapshot size.\"}"
      BUILDING_SINCE=$NOW
    fi
  else
    BUILDING_SINCE=""
  fi

  if [ "$STATUS" = "SUCCESS" ] && [ "$UPTIME" -lt 900 ]; then
    printf '%s\n' "AGENT_LOOP_WAKE_DEPLOY {\"prompt\":\"$PROMPT Deploy SUCCESS, uptime ${UPTIME}s — verify UI, health commit, smoke test.\"}"
    exit 0
  fi

  if [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CRASHED" ]; then
    printf '%s\n' "AGENT_LOOP_WAKE_DEPLOY {\"prompt\":\"$PROMPT Deploy $DEPLOY_ID $STATUS — read buildLogs, fix nixpacks/Dockerfile, push, redeploy.\"}"
    exit 0
  fi

  sleep 120
done
