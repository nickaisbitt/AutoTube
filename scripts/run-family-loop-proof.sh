#!/usr/bin/env bash
# Sequential loop proof: pin topic → generate → watch toward raw 8.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a && . ./.env.local && set +a
export OPENROUTER_VISION_MODEL=xiaomi/mimo-v2.5
export OPENROUTER_MODEL=xiaomi/mimo-v2.5
# Flash off by default (white frames dunk brutal); zoom-punch stays on via patternInterrupts.
unset AUTOTUBE_FLASH_INTERRUPTS

reset_fix_state() {
  local topic="$1"
  local tier="${2:-draft}"
  node -e "
const fs=require('fs');
const p='test-recordings/improvement-loop/FIX_STATE.json';
const s=JSON.parse(fs.readFileSync(p,'utf8'));
s.pendingTopic=process.argv[1];
s.renderTier=process.argv[2];
s.topicRetryCount=0;
s.generateFailureCount=0;
s.mediaOffset=0;
s.harvestNonce=0;
s.reHarvestMedia=true;
s.fixStrategy='reharvest';
s.faceSeekBroll=true;
s.harvestVideoFirst=true;
s.preferBrightBroll=true;
s.patternInterrupts=true;
s.whisperAlign=true;
s.impactBeatIntervalSec=3.5;
s.rewriteScript=false;
s.hookLine=null;
delete s.hookOverlay;
delete s.impactBeats;
s.status='idle';
fs.writeFileSync(p, JSON.stringify(s,null,2));
console.log('pinned', process.argv[1], 'tier', process.argv[2]);
" "$topic" "$tier"
}

run_one() {
  local label="$1"
  local topic="$2"
  local max="$3"
  local tier="${4:-draft}"
  local log="/tmp/loop-proof-${label}.log"
  echo "========== $label ($tier, max=$max) ==========" | tee -a /tmp/loop-proof-all.log
  reset_fix_state "$topic" "$tier"
  npm run loop:video -- --until-score 8.0 --max "$max" --delay 8 2>&1 | tee "$log"
  echo "========== $label DONE ==========" | tee -a /tmp/loop-proof-all.log
  grep -E 'TARGET SCORE|Brutal overall|Upload-ready|Generate failed|HARVEST_VOLUME|Reached --max' "$log" | tail -8 | tee -a /tmp/loop-proof-all.log || true
}

# Diamond: skip if already proven unless FORCE_DIAMOND=1.
if [ "${FORCE_DIAMOND:-0}" = "1" ]; then
  run_one diamond "The diamond heist that used a fake airport" 4 full
fi
run_one veterans "Why veterans benefits data leaked to dark web brokers" 4 draft
run_one landlord "How landlords use AI to evict tenants faster" 4 full
run_one bank "Why your bank account could be emptied by an AI voice clone" 4 draft
run_one healthcare "The hospital hack that exposed 10 million patient records overnight" 4 draft

echo "ALL PROOFS COMPLETE" | tee -a /tmp/loop-proof-all.log
