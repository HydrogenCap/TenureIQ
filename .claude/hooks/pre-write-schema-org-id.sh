#!/usr/bin/env bash
# pre-write-schema-org-id.sh
#
# Hook: PreToolUse on Write|Edit when target is prisma/schema.prisma.
# Fails (exit 1) if any model block lacks `organisationId` and is not exempted
# by a `// reference data — global` (or `// reference-data`) comment in its body.
#
# Input: JSON from Claude Code on stdin, with tool_input.{path,content,file_text,new_str}.
# Output: exit 0 = allow, exit 1 = block.

set -euo pipefail

payload="$(cat)"

# Resolve target path
file_path="$(echo "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("path",""))')"

case "$file_path" in
  *prisma/schema.prisma) ;;
  *) exit 0 ;;
esac

# Run the model-block analyser in Python, with the payload re-passed via env to avoid
# stdin-collision with the heredoc.
HOOK_PAYLOAD="$payload" python3 <<'PY'
import json, os, re, sys

payload = json.loads(os.environ["HOOK_PAYLOAD"])
ti = payload.get("tool_input", {})

# Extract the proposed content: Write/create_file have .content or .file_text;
# Edit/str_replace have .new_str (we only see the new fragment, which still catches
# additions of new models).
proposed = ti.get("content") or ti.get("file_text") or ti.get("new_str") or ti.get("new_string") or ""
if not proposed:
    sys.exit(0)

# Match: model Foo { ... }
pattern = re.compile(r'^\s*model\s+(\w+)\s*\{([^}]*)\}', re.MULTILINE)

violations = []
for m in pattern.finditer(proposed):
    name = m.group(1)
    body = m.group(2)

    # Exempted via comment? Accept en-dash, em-dash, or plain hyphen
    if re.search(r'//\s*reference[-\s]*data\b', body, re.IGNORECASE):
        continue

    # Has organisationId field mapped to organisation_id column?
    if re.search(
        r'\borganisationId\s+\S+.*@map\(\s*"organisation_id"\s*\)',
        body,
        re.DOTALL,
    ):
        continue

    violations.append(name)

if not violations:
    sys.exit(0)

print("❌ Prisma schema check: the following model(s) are missing 'organisationId' and aren't marked as reference data:", file=sys.stderr)
for v in violations:
    print(f"   - model {v}", file=sys.stderr)

print("""
Every tenant-scoped table needs:
  organisationId  String  @map("organisation_id") @db.Uuid
  organisation    Organisation @relation(fields: [organisationId], references: [id])

For global reference data (lha_rates, postcode_areas, aasc_areas, etc) add this
comment inside the model body to mark intentional exemption:

  model PostcodeArea {
    // reference data — global
    code String @id
    ...
  }

See: skills/tenureiq-conventions/references/schema-design.md
""", file=sys.stderr)
sys.exit(1)
PY
