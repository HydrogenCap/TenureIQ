#!/usr/bin/env bash
# Block `: any`, `as any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`.
# Exceptions: lib/adapters/* (third-party type bandaging), declaration files, tests' factories.

set -euo pipefail

INPUT=$(cat)

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_str // empty' 2>/dev/null || true)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

# Only check TS/TSX
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) echo '{"decision":"allow"}'; exit 0 ;;
esac

# Exception paths
case "$FILE_PATH" in
  */lib/adapters/*|*.d.ts)
    echo '{"decision":"allow"}'
    exit 0
    ;;
esac

VIOLATIONS=""

# `: any` (but not "many" or "company" or "anyone" — needs word boundary)
ANY_TYPE=$(echo "$CONTENT" | grep -nE ':\s*any\b' | grep -vE 'company|many|anyone|anything|anywhere' | head -5 || true)
if [ -n "$ANY_TYPE" ]; then
  VIOLATIONS="${VIOLATIONS}Direct any type:\n${ANY_TYPE}\n\n"
fi

# `as any`
AS_ANY=$(echo "$CONTENT" | grep -nE 'as\s+any\b' | head -3 || true)
if [ -n "$AS_ANY" ]; then
  VIOLATIONS="${VIOLATIONS}'as any' cast:\n${AS_ANY}\n\n"
fi

# `as unknown as`
AS_UNKNOWN=$(echo "$CONTENT" | grep -nE 'as\s+unknown\s+as\s+' | head -3 || true)
if [ -n "$AS_UNKNOWN" ]; then
  VIOLATIONS="${VIOLATIONS}'as unknown as' double-cast:\n${AS_UNKNOWN}\n\n"
fi

# @ts-ignore / @ts-nocheck
TS_IGNORE=$(echo "$CONTENT" | grep -nE '@ts-(ignore|nocheck)' | head -3 || true)
if [ -n "$TS_IGNORE" ]; then
  VIOLATIONS="${VIOLATIONS}@ts-ignore or @ts-nocheck:\n${TS_IGNORE}\n\n"
fi

if [ -n "$VIOLATIONS" ]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "TenureIQ convention violation: no 'any', 'as any', 'as unknown as', '@ts-ignore', '@ts-nocheck'.\n\nFile: ${FILE_PATH}\n\n${VIOLATIONS}Fix: model the type correctly. If you're working around a third-party library with bad types, wrap it in a typed adapter under lib/adapters/<lib>.ts — that file is exempt from this rule."
}
EOF
  exit 0
fi

echo '{"decision":"allow"}'
