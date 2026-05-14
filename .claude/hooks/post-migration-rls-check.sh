#!/usr/bin/env bash
# post-migration-rls-check.sh
#
# Hook: PostToolUse on Write|Edit when tool path matches supabase/migrations/*.sql
# Fails (exit 1) if the migration contains a new CREATE TABLE without:
#   - alter table ... enable row level security
#   - at least one CREATE POLICY against the table
#
# Allows the table to be exempted via a marker comment: -- @tenureiq:reference-data
# placed within the CREATE TABLE statement, for global reference tables that don't
# need RLS (lha_rates, postcode_areas, etc).
#
# Input: JSON from Claude Code on stdin, with .tool_input.path = file path.
# Output: exit 0 = allow, exit 1 = block (Claude must address the issue).

set -euo pipefail

# Read the hook payload
payload="$(cat)"
file_path="$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("path",""))')"

# Only care about SQL migrations
case "$file_path" in
  *supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac

# File may not exist yet if the edit failed; bail gracefully.
[[ -f "$file_path" ]] || exit 0

# Normalise to a single line per logical statement, lowercased, for matching
content="$(tr '[:upper:]' '[:lower:]' < "$file_path")"

# Extract all `create table [if not exists] <name>` declarations.
# This grep is intentionally permissive — it catches `create table foo (` and `create table public.foo (`.
mapfile -t created_tables < <(
  echo "$content" \
    | grep -oE 'create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?[a-z_."]+' \
    | sed -E 's/create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?//' \
    | sed -E 's/^(public\.)?"?([a-z_]+)"?.*$/\2/' \
    | sort -u
)

if [[ ${#created_tables[@]} -eq 0 ]]; then
  exit 0
fi

errors=()

for table in "${created_tables[@]}"; do
  # Skip empty or whitespace-only
  [[ -z "${table// }" ]] && continue

  # Allow reference-data marker — scan the CREATE TABLE block for the marker comment
  # Extract the CREATE TABLE block (from "create table <name>" until the closing ");")
  block="$(awk -v t="$table" '
    BEGIN { in_block=0 }
    tolower($0) ~ ("create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(public\\.)?\"?" t "\"?") { in_block=1 }
    in_block { print }
    in_block && /\);/ { in_block=0; exit }
  ' "$file_path" || true)"

  if echo "$block" | grep -qiE '@tenureiq:reference-data'; then
    continue  # explicitly exempted
  fi

  # Look for: alter table <table> enable row level security
  if ! echo "$content" | grep -qE "alter[[:space:]]+table[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?(public\\.)?\"?${table}\"?[[:space:]]+enable[[:space:]]+row[[:space:]]+level[[:space:]]+security"; then
    errors+=("Table '${table}': missing 'alter table ${table} enable row level security;'")
  fi

  # Look for at least one: create policy ... on <table>
  if ! echo "$content" | grep -qE "create[[:space:]]+policy[[:space:]]+[^;]*on[[:space:]]+(public\\.)?\"?${table}\"?"; then
    errors+=("Table '${table}': no CREATE POLICY statements found")
  fi
done

if [[ ${#errors[@]} -gt 0 ]]; then
  echo "❌ RLS check failed for: $file_path" >&2
  for e in "${errors[@]}"; do echo "   - $e" >&2; done
  cat >&2 <<'MSG'

Every tenant-scoped table needs RLS enabled plus the standard four-policy template
(select / insert / update / delete). See:
  skills/tenureiq-conventions/references/rls-policy-pattern.md

For global reference tables (lha_rates, postcode_areas, etc) that intentionally
have no tenant scope, add this comment inside the CREATE TABLE statement:
  -- @tenureiq:reference-data

MSG
  exit 1
fi

exit 0
