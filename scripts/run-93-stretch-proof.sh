#!/usr/bin/env bash
# Aspirational 9.3 brutal gate on nursing topic (documented 8.2 baseline).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a && . ./.env.local && set +a
export OPENROUTER_VISION_MODEL=xiaomi/mimo-v2.5
export OPENROUTER_MODEL=xiaomi/mimo-v2.5
unset AUTOTUBE_FLASH_INTERRUPTS

LOG="/tmp/loop-proof-93-stretch.log"
rm -f test-recordings/improvement-loop/LOOP.lock

node -e "
const fs=require('fs');
const p='test-recordings/improvement-loop/FIX_STATE.json';
const s=JSON.parse(fs.readFileSync(p,'utf8'));
const topic='The nursing home cameras that recorded abuse for years';
s.pendingTopic=topic;
s.renderTier='full';
s.cutIntervalSec=0.85;
s.topicRetryCount=0;
s.generateFailureCount=0;
s.maxRetriesPerTopic=8;
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
s.maxReusePerUrl=1;
s.minAssetsPerSegment=6;
s.hookLine=null;
delete s.hookOverlay;
delete s.impactBeats;
s.status='idle';
fs.writeFileSync(p, JSON.stringify(s,null,2));
console.log('9.3 stretch pinned', topic);
"

echo "========== 9.3 stretch (nursing, full, max=8) ==========" | tee "$LOG"
npm run loop:video -- --until-score 9.3 --max 8 --delay 8 2>&1 | tee -a "$LOG"
grep -E 'TARGET SCORE|Brutal overall|Upload-ready|Reached --max|stretch:' "$LOG" | tail -15
