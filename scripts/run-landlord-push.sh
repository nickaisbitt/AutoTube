#!/usr/bin/env bash
# Landlord-only push: iter-117 render profile + 6 retries toward raw 8.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a && . ./.env.local && set +a
export OPENROUTER_VISION_MODEL=xiaomi/mimo-v2.5
export OPENROUTER_MODEL=xiaomi/mimo-v2.5
unset AUTOTUBE_FLASH_INTERRUPTS

LOG="/tmp/loop-proof-landlord-v4.log"
rm -f test-recordings/improvement-loop/LOOP.lock

node -e "
const fs=require('fs');
const p='test-recordings/improvement-loop/FIX_STATE.json';
const s=JSON.parse(fs.readFileSync(p,'utf8'));
const topic='How landlords use AI to evict tenants faster';
s.pendingTopic=topic;
s.renderTier='full';
s.cutIntervalSec=0.85;
s.topicRetryCount=0;
s.generateFailureCount=0;
s.mediaOffset=10;
s.harvestNonce=2;
s.reHarvestMedia=true;
s.fixStrategy='reharvest';
s.faceSeekBroll=true;
s.harvestVideoFirst=true;
s.preferBrightBroll=true;
s.patternInterrupts=true;
s.whisperAlign=true;
s.impactBeatIntervalSec=3.5;
s.rewriteScript=false;
s.maxReusePerUrl=1;
s.maxRetriesPerTopic=6;
s.minAssetsPerSegment=6;
s.hookLine=null;
delete s.hookOverlay;
delete s.impactBeats;
s.status='idle';
fs.writeFileSync(p, JSON.stringify(s,null,2));
console.log('landlord push pinned', topic);
"

echo "========== landlord push (full, max=6) ==========" | tee "$LOG"
npm run loop:video -- --until-score 8.0 --max 6 --delay 8 2>&1 | tee -a "$LOG"
grep -E 'TARGET SCORE|Brutal overall|Upload-ready|Reached --max' "$LOG" | tail -10
