#!/usr/bin/env bash
# Connect autotube → GitHub + trigger deploy using curl only (no Node fetch).
# Usage: RAILWAY_API_TOKEN=... ./scripts/railway-graphql-curl-connect.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TOKEN="${RAILWAY_API_TOKEN:-${RAILWAY_TOKEN:-${Railway:-}}}"
PROJECT_ID="${AUTOTUBE_RAILWAY_PROJECT_ID:-283b075f-eb25-4a60-8468-a45d77e068bc}"
REPO="${RAILWAY_REPO:-nickaisbitt/AutoTube}"
BRANCH="${RAILWAY_BRANCH:-master}"
SERVICE_NAME="${RAILWAY_SERVICE:-autotube}"
GRAPHQL="${RAILWAY_GRAPHQL_ENDPOINT:-https://backboard.railway.app/graphql/v2}"
HEALTH_URL="${AUTOTUBE_HEALTH_URL:-https://autotube-production.up.railway.app/api/health}"

if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: Set RAILWAY_API_TOKEN (or Railway / RAILWAY_TOKEN)" >&2
  exit 1
fi

TMPDIR="${TMPDIR:-/tmp}/railway-gql-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

gql() {
  local body_file="$TMPDIR/body.json"
  printf '%s' "$1" >"$body_file"
  curl -sfS "$GRAPHQL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @"$body_file"
}

echo "=== Railway GraphQL connect (curl) ==="
echo "Project: $PROJECT_ID"
echo "Repo: $REPO @ $BRANCH"

PROJECT_JSON="$(gql "{\"query\":\"query(\$id: String!) { project(id: \$id) { id name environments { edges { node { id name } } } services { edges { node { id name } } } } }\",\"variables\":{\"id\":\"$PROJECT_ID\"}}")"

SERVICE_ID="$(printf '%s' "$PROJECT_JSON" | python3 -c "
import json,sys,os
d=json.load(sys.stdin)
if d.get('errors'):
    print('ERR:'+';'.join(e['message'] for e in d['errors']), file=sys.stderr); sys.exit(1)
p=d['data']['project']
name=os.environ.get('SN','autotube')
sv=[e['node'] for e in p['services']['edges']]
s=next((x for x in sv if x['name']==name), sv[0] if sv else None)
if not s: sys.exit('no service')
print(s['id'])
" SN="$SERVICE_NAME")"

ENV_ID="$(printf '%s' "$PROJECT_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=d['data']['project']
ev=[e['node'] for e in p['environments']['edges']]
e=next((x for x in ev if x['name']=='production'), ev[0] if ev else None)
if not e: sys.exit('no env')
print(e['id'])
")"

echo "Service id: $SERVICE_ID"
echo "Environment id: $ENV_ID"

CONNECT_JSON="$(gql "{\"query\":\"mutation(\$id: String!, \$input: ServiceConnectInput!) { serviceConnect(id: \$id, input: \$input) { id } }\",\"variables\":{\"id\":\"$SERVICE_ID\",\"input\":{\"repo\":\"$REPO\",\"branch\":\"$BRANCH\"}}}")"

printf '%s' "$CONNECT_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('errors'):
    print('serviceConnect ERR:', ';'.join(e['message'] for e in d['errors']), file=sys.stderr); sys.exit(1)
print('SUCCESS: serviceConnect', d['data']['serviceConnect']['id'])
"

DEPLOY_JSON="$(gql "{\"query\":\"mutation(\$serviceId: String!, \$environmentId: String!) { serviceInstanceDeployV2(serviceId: \$serviceId, environmentId: \$environmentId) { id } }\",\"variables\":{\"serviceId\":\"$SERVICE_ID\",\"environmentId\":\"$ENV_ID\"}}" || true)"

if printf '%s' "$DEPLOY_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('data',{}).get('serviceInstanceDeployV2') else 1)" 2>/dev/null; then
  printf '%s' "$DEPLOY_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print('SUCCESS: deploy', d['data']['serviceInstanceDeployV2']['id'])"
else
  echo "WARN: deploy mutation failed or skipped — git push origin master to trigger build"
fi

echo ""
echo "Health before:"
curl -sfS "$HEALTH_URL" | python3 -c "import json,sys; h=json.load(sys.stdin); print(' uptime', round(h.get('uptime',0)), 's')"

echo "Polling health (up to 10 min)..."
START_UPTIME="$(curl -sfS "$HEALTH_URL" | python3 -c "import json,sys; print(json.load(sys.stdin).get('uptime',999999))")"

for i in $(seq 1 60); do
  sleep 10
  H="$(curl -sfS "$HEALTH_URL")"
  printf '%s' "$H" | python3 -c "
import json,sys,os
h=json.load(sys.stdin)
u=h.get('uptime',0)
d=h.get('deploy') or {}
print(f'  [{os.environ.get(\"I\",\"?\")}] uptime={round(u)}s commit={(str(d.get(\"gitCommit\") or \"—\"))[:7]} connected={d.get(\"sourceConnected\",\"—\")}')
"
  CUR="$(printf '%s' "$H" | python3 -c "import json,sys; print(json.load(sys.stdin).get('uptime',0))")"
  if python3 -c "import sys; start=float(sys.argv[1]); cur=float(sys.argv[2]); sys.exit(0 if cur < start*0.5 else 1)" "$START_UPTIME" "$CUR" 2>/dev/null; then
    echo "SUCCESS: new deployment detected — $HEALTH_URL"
    exit 0
  fi
  export I="$i"
done

echo "Deploy may still be building — check Railway → Deployments. Health: $HEALTH_URL"
exit 0
