#!/usr/bin/env bash
# pre-commit-domain-coverage.sh
#
# Hook: PreToolUse on Bash when the command is `git commit`.
# Blocks the commit if a file in lib/domain/ was modified without its matching .test.ts
# also being modified (or already existing and being modified).
#
# Logic:
#   1. Find staged files in lib/domain/ (excluding .test.ts and index.ts).
#   2. For each, check whether the matching <name>.test.ts is also staged OR exists.
#   3. If neither: block.
#
# Skip with the standard env var if needed for a refactor that genuinely doesn't
# need test changes: TENUREIQ_SKIP_DOMAIN_COVERAGE=1 git commit ...
#
# Input: JSON from Claude Code on stdin, with .tool_input.command = the bash command.

set -euo pipefail

payload="$(cat)"
command="$(echo "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))')"

# Only act on git commit invocations
case "$command" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Honour explicit override
if [[ "${TENUREIQ_SKIP_DOMAIN_COVERAGE:-}" == "1" ]]; then
  exit 0
fi

# Find the repository root from the current working directory
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  exit 0  # not in a git repo — nothing to do
fi

cd "$repo_root"

# Files staged for commit
staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"

# Domain files (excluding tests and barrel files)
domain_changes="$(echo "$staged_files" | grep -E '^lib/domain/[^/]+\.ts$' | grep -vE '\.test\.ts$|/index\.ts$' || true)"

if [[ -z "$domain_changes" ]]; then
  exit 0
fi

missing=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  test_file="${f%.ts}.test.ts"

  # Was the test file also staged?
  if echo "$staged_files" | grep -qxF "$test_file"; then
    continue
  fi

  # Does the test file at least exist in the working tree?
  if [[ -f "$test_file" ]]; then
    # File exists but wasn't modified alongside the source — soft warning, not a block.
    # This is the "I changed behaviour but didn't update tests" case.
    echo "⚠️  $f modified but $test_file is not staged. Verify the test still covers your changes." >&2
    continue
  fi

  missing+=("$f")
done <<< "$domain_changes"

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "❌ Domain coverage check failed:" >&2
  for f in "${missing[@]}"; do
    echo "   - $f has no matching ${f%.ts}.test.ts" >&2
  done
  cat >&2 <<'MSG'

Every public function in lib/domain/ needs at least 3 test cases in its sibling .test.ts.
The domain layer is pure and must stay test-covered — it's the core that everything else
depends on, and a missing test usually means an untested edge case is about to ship.

To bypass for a genuine refactor (e.g. file rename only):
  TENUREIQ_SKIP_DOMAIN_COVERAGE=1 git commit ...

MSG
  exit 1
fi

exit 0
