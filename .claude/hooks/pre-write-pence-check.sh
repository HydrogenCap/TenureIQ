#!/usr/bin/env bash
# Block writes that contain money columns/variables without _pence suffix.
# Claude Code passes the tool input via stdin as JSON.

set -euo pipefail

INPUT=$(cat)

# Extract content being written. Works for Write, Edit, MultiEdit.
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_str // .tool_input.edits // empty' 2>/dev/null || true)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

# Skip non-code files
case "$FILE_PATH" in
  *.md|*.json|*.yml|*.yaml|*.sh|*.txt|*.lock)
    echo '{"decision":"allow"}'
    exit 0
    ;;
esac

# Skip test files (mocks may have intentional shortcuts)
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*tests/*)
    echo '{"decision":"allow"}'
    exit 0
    ;;
esac

VIOLATIONS=""

# Pattern 1: TypeScript fields/variables named like money but missing _pence suffix
# Match: `purchasePrice:` `monthlyPayment:` `balance:` `rent:` `deposit:` etc
# Allow if `Pence` or `Bps` or `Gbp` (UI helper context) is in the name
BAD_MONEY=$(echo "$CONTENT" | grep -nEi '\b(purchasePrice|monthlyPayment|rent|deposit|salary|cost|fee|amount|value|loan|balance|payment)\b\s*[:=]' \
  | grep -vEi '(Pence|Bps|Gbp|Display|Formatted|Label)' \
  | grep -vEi '(_pence|_bps|amountInPence)' \
  | head -5 || true)

if [ -n "$BAD_MONEY" ]; then
  VIOLATIONS="${VIOLATIONS}Money-shaped identifiers without _pence/Pence suffix:\n${BAD_MONEY}\n\n"
fi

# Pattern 2: Prisma model fields with money names lacking Pence
BAD_PRISMA=$(echo "$CONTENT" | grep -nEi '^\s*(purchasePrice|monthlyPayment|rent|deposit|balance|amount|value|loan|fee)\s+(Decimal|Float|Int|BigInt)\b' \
  | grep -vEi 'Pence' \
  | head -5 || true)

if [ -n "$BAD_PRISMA" ]; then
  VIOLATIONS="${VIOLATIONS}Prisma money fields missing Pence suffix:\n${BAD_PRISMA}\n\n"
fi

# Pattern 3: SQL columns
BAD_SQL=$(echo "$CONTENT" | grep -nEi '\b(price|rent|deposit|balance|amount|cost|payment|loan)\s+(numeric|decimal|float|double|real|money)\b' \
  | grep -vEi '_pence' \
  | head -5 || true)

if [ -n "$BAD_SQL" ]; then
  VIOLATIONS="${VIOLATIONS}SQL money columns must be 'bigint' with _pence suffix, not numeric/decimal/float:\n${BAD_SQL}\n\n"
fi

# Pattern 4: Rate fields lacking _bps suffix
BAD_RATE=$(echo "$CONTENT" | grep -nEi '\b(interestRate|stressRate|sdltRate|taxRate|cgRate|ctRate|marginRate)\s*[:=]' \
  | grep -vEi '(Bps|_bps)' \
  | head -3 || true)

if [ -n "$BAD_RATE" ]; then
  VIOLATIONS="${VIOLATIONS}Rate-shaped identifiers without Bps suffix (use basis points int, not float percent):\n${BAD_RATE}\n\n"
fi

if [ -n "$VIOLATIONS" ]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "TenureIQ convention violation: money must be bigint pence (_pence suffix), rates must be int basis points (_bps suffix). See .claude/hooks/pre-write-pence-check.sh.\n\n${VIOLATIONS}\nFix: rename to <name>Pence (bigint) or <name>Bps (int)."
}
EOF
  exit 0
fi

echo '{"decision":"allow"}'
