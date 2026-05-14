#!/usr/bin/env bash
# Block service-role / Prisma imports outside the allowed paths.
# Allowed: lib/jobs/, lib/admin/, lib/cron/, app/api/webhooks/, prisma/, scripts/, lib/db/admin.ts, lib/db/prisma.ts

set -euo pipefail

INPUT=$(cat)

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_str // empty' 2>/dev/null || true)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

# Only check TS/TSX
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) echo '{"decision":"allow"}'; exit 0 ;;
esac

# Allowed locations (the only places service role / Prisma may be imported)
case "$FILE_PATH" in
  */lib/jobs/*|*/lib/admin/*|*/lib/cron/*|*/app/api/webhooks/*|*/prisma/*|*/scripts/*|*/lib/db/admin.ts|*/lib/db/prisma.ts|*/tests/integration/*|*/tests/factories/*)
    echo '{"decision":"allow"}'
    exit 0
    ;;
esac

# Detect forbidden imports
FORBIDDEN=$(echo "$CONTENT" | grep -nE "from\s+['\"](.*lib/db/(admin|prisma)|@/lib/db/(admin|prisma)|@prisma/client)['\"]" || true)

if [ -n "$FORBIDDEN" ]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "TenureIQ convention violation: service-role Supabase client and Prisma client must not be imported in user-facing code paths because they bypass RLS.\n\nFile: ${FILE_PATH}\n\nForbidden imports found:\n${FORBIDDEN}\n\nFix:\n  - Use 'import { supabaseServer } from \"@/lib/db/user\"' for user-facing queries (preserves RLS).\n  - If this code legitimately needs to bypass RLS (cron, webhook, admin tool), move it to one of: lib/jobs/, lib/admin/, lib/cron/, app/api/webhooks/."
}
EOF
  exit 0
fi

# Also detect direct service-role key usage in code (rather than env)
KEY_USAGE=$(echo "$CONTENT" | grep -nE 'SUPABASE_SERVICE_ROLE_KEY' || true)
if [ -n "$KEY_USAGE" ]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "TenureIQ convention violation: SUPABASE_SERVICE_ROLE_KEY is referenced in ${FILE_PATH}, which is outside the allowed paths (lib/db/admin.ts, lib/jobs/, lib/admin/, lib/cron/, app/api/webhooks/).\n\n${KEY_USAGE}\n\nFix: only reference the service role key inside lib/db/admin.ts, which exports a typed supabaseService() helper guarded by 'server-only'."
}
EOF
  exit 0
fi

echo '{"decision":"allow"}'
