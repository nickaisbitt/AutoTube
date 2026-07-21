#!/usr/bin/env bash
# 1) Landlord push → raw 8
# 2) Full family re-proof (once landlord clears or after push exhausts)
# 3) Insurance fraud family proof (next ranked topic)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== PHASE 1: Landlord push ===" | tee /tmp/loop-all-three.log
./scripts/run-landlord-push.sh 2>&1 | tee -a /tmp/loop-all-three.log

if grep -q 'TARGET SCORE' /tmp/loop-proof-landlord-v4.log 2>/dev/null; then
  echo "=== PHASE 2: Family re-proof (landlord cleared) ===" | tee -a /tmp/loop-all-three.log
  ./scripts/run-family-loop-proof.sh 2>&1 | tee -a /tmp/loop-all-three.log
else
  echo "=== PHASE 2: Skipped — landlord did not hit TARGET SCORE (raw 8) ===" | tee -a /tmp/loop-all-three.log
  echo "Run ./scripts/run-family-loop-proof.sh manually after landlord clears." | tee -a /tmp/loop-all-three.log
fi

echo "=== PHASE 3: Insurance fraud family ===" | tee -a /tmp/loop-all-three.log
./scripts/run-insurance-loop-proof.sh 2>&1 | tee -a /tmp/loop-all-three.log

echo "=== PHASE 4: 9.3 brutal stretch (nursing) ===" | tee -a /tmp/loop-all-three.log
./scripts/run-93-stretch-proof.sh 2>&1 | tee -a /tmp/loop-all-three.log

echo "ALL THREE PHASES COMPLETE" | tee -a /tmp/loop-all-three.log
