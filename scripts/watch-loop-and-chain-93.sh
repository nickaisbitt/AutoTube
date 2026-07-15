#!/usr/bin/env bash
# Watch landlord/all-three loops; write ping file; chain 9.3 stretch when idle.
set -euo pipefail
cd "$(dirname "$0")/.."

PING="/tmp/loop-landlord-ping.json"
MASTER="/tmp/loop-all-three.log"
LANDLORD="/tmp/loop-proof-landlord-v4.log"
STRETCH="/tmp/loop-proof-93-stretch.log"

write_ping() {
  local phase="$1"
  local target_hit="${2:-false}"
  node -e "
const fs=require('fs');
const ping={
  at: new Date().toISOString(),
  phase,
  targetHit: $target_hit === 'true',
  landlordLog: '$LANDLORD',
  masterLog: '$MASTER',
};
try {
  const log=fs.readFileSync('$LANDLORD','utf8');
  const scores=[...log.matchAll(/Brutal overall:\\*\\* ([0-9.]+)\\/10 \\(raw ([0-9.]+)/g)].map(m=>({floored:+m[1],raw:+m[2]}));
  ping.landlordScores=scores;
  ping.landlordBest=scores.reduce((b,s)=>!b||s.raw>b.raw?s:b,null);
  ping.uploadReady=[...log.matchAll(/Upload-ready\\?\\*\\* (YES|NO)/g)].map(m=>m[1]);
  ping.targetScore=log.includes('TARGET SCORE');
} catch { /* landlord log may not exist yet */ }
fs.writeFileSync('$PING', JSON.stringify(ping,null,2));
console.log('ping', '$PING', phase);
"
}

echo "[watch] monitoring landlord loop → $PING"

# Phase 1: wait until landlord push finishes (render done + watcher or max reached)
while true; do
  if [ -f "$LANDLORD" ] && grep -qE 'TARGET SCORE|Reached --max 6|PHASE 2' "$MASTER" 2>/dev/null; then
    break
  fi
  if [ -f "$LANDLORD" ] && grep -q 'Reached --max 6' "$LANDLORD" 2>/dev/null; then
    break
  fi
  sleep 90
done

TARGET=false
grep -q 'TARGET SCORE' "$LANDLORD" 2>/dev/null && TARGET=true
write_ping "landlord_done" "$TARGET"

echo "[watch] landlord phase complete (target=$TARGET). ping → $PING"

# Phase 2: wait for all-three pipeline (insurance) to finish
while ! grep -q 'ALL THREE PHASES COMPLETE' "$MASTER" 2>/dev/null; do
  sleep 120
done

write_ping "all_three_done" "$TARGET"
echo "[watch] all-three complete — starting 9.3 stretch"

rm -f test-recordings/improvement-loop/LOOP.lock
./scripts/run-93-stretch-proof.sh 2>&1 | tee -a "$MASTER"

STRETCH_HIT=false
grep -q 'TARGET SCORE' "$STRETCH" 2>/dev/null && STRETCH_HIT=true
node -e "
const fs=require('fs');
const ping=JSON.parse(fs.readFileSync('$PING','utf8'));
ping.stretchAt=new Date().toISOString();
ping.stretchTargetHit=$STRETCH_HIT === 'true';
ping.stretchLog='$STRETCH';
try {
  const log=fs.readFileSync('$STRETCH','utf8');
  const scores=[...log.matchAll(/Brutal overall:\\*\\* ([0-9.]+)\\/10 \\(raw ([0-9.]+)/g)].map(m=>({floored:+m[1],raw:+m[2]}));
  ping.stretchScores=scores;
  ping.stretchBest=scores.reduce((b,s)=>!b||s.raw>b.raw?s:b,null);
} catch {}
fs.writeFileSync('$PING', JSON.stringify(ping,null,2));
"
echo "[watch] 9.3 stretch done (target=$STRETCH_HIT). Final ping → $PING"
