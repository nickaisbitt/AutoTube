#!/bin/bash
# Prevent focused tests from reaching CI
if grep -rn "test\.only\|it\.only\|describe\.only\|fit\|fdescribe\|ftest" src/ server/ tests/ e2e/ --include="*.ts" --include="*.tsx" --include="*.mjs" 2>/dev/null; then
  echo "ERROR: Focused tests found. Remove .only calls before committing."
  exit 1
fi
echo "No focused tests found."
exit 0
