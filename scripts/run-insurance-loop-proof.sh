#!/usr/bin/env bash
# Insurance fraud family proof toward raw 8.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a && . ./.env.local && set +a
export OPENROUTER_VISION_MODEL=xiaomi/mimo-v2.5
export OPENROUTER_MODEL=xiaomi/mimo-v2.5
unset AUTOTUBE_FLASH_INTERRUPTS

LOG="/tmp/loop-proof-insurance.log"
rm -f test-recordings/improvement-loop/LOOP.lock

node -e "
const fs=require('fs');
const p='test-recordings/improvement-loop/FIX_STATE.json';
const s=JSON.parse(fs.readFileSync(p,'utf8'));
const topic='The insurance scam using fake car crash videos';
s.pendingTopic=topic;
s.renderTier='draft';
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
s.rewriteScript=false;
s.maxReusePerUrl=1;
s.minAssetsPerSegment=6;
s.hookLine=null;
delete s.hookOverlay;
delete s.impactBeats;
s.status='idle';
fs.writeFileSync(p, JSON.stringify(s,null,2));
console.log('pinned', topic);
"

echo "========== insurance (draft→full, max=4) ==========" | tee "$LOG"
npm run loop:video -- --until-score 8.0 --max 4 --delay 8 2>&1 | tee -a "$LOG"
grep -E 'TARGET SCORE|Brutal overall|Upload-ready|Reached --max' "$LOG" | tail -10
