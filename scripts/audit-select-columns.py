#!/usr/bin/env python3
"""
Cross-check every supabase-js `.select('col, col, …')` call against
the actual columns declared in prisma/schema.prisma.

The bug class we're guarding against: silently selecting a column that
doesn't exist. Supabase / PostgREST returns a 400 at runtime; in
practice the request usually returns an empty array (RLS-filtered) or
the row is fetched as a partial object, and the page renders with
nulls everywhere. That's exactly what happened with the
`weekly_rent_pence` typo on `tenancies` (the column on that table is
`rent_pence` + `rent_period`) which silently zeroed the Gross Yield
KPI on every property page until the audit caught it.

Run from the repo root:

    python3 scripts/audit-select-columns.py

Exits 0 if every plain selector matches a schema column, 1 otherwise.

Limitations:
- Skips relation selectors (`entity:entities(name)`) — those refer
  to columns on the other table, which would need a recursive parse.
- Skips dynamic template-literal selectors (`select(\\`\\${prefCol}…\\`)`)
  — the column is computed at runtime and can't be statically checked.
- Reads up to 10 lines after a `.from(TABLE)` to find its matching
  `.select(…)`. Re-running with `--window N` would let us widen if
  someone writes an unusually long multi-line builder chain.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

SCHEMA_PATH = Path("prisma/schema.prisma")


def parse_schema() -> dict[str, set[str]]:
    """Return { table_name: {column_names_in_postgres} }."""
    schema = SCHEMA_PATH.read_text()
    out: dict[str, set[str]] = {}
    for m in re.finditer(r"model\s+(\w+)\s*\{([\s\S]*?)\n\}", schema):
        model_name, body = m.group(1), m.group(2)
        map_match = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_match.group(1) if map_match else model_name.lower() + "s"
        cols: set[str] = set()
        for line in body.split("\n"):
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("@@"):
                continue
            if not re.match(r"\w+\s+\S", line):
                continue
            field_match = re.match(r"(\w+)\s+\S", line)
            map_match = re.search(r'@map\("([^"]+)"\)', line)
            if map_match:
                cols.add(map_match.group(1))
            else:
                if field_match is None:
                    continue
                # camelCase → snake_case (Prisma's default mapping).
                snake = re.sub(r"([A-Z])", r"_\1", field_match.group(1)).lower().lstrip("_")
                cols.add(snake)
        if cols:
            out[table] = cols
    return out


def split_top_level_commas(s: str) -> list[str]:
    """Split a Postgrest selector by commas at parenthesis depth 0.

    `id, entity:entities(name, kind), postcode` → ['id',
    'entity:entities(name, kind)', 'postcode']
    """
    depth = 0
    cur: list[str] = []
    out: list[str] = []
    for ch in s:
        if ch == "(":
            depth += 1
            cur.append(ch)
        elif ch == ")":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        out.append("".join(cur).strip())
    return out


SKIP_DIRS = {"node_modules", ".next", ".git", ".turbo"}


def main() -> int:
    table_cols = parse_schema()
    if not table_cols:
        print("error: no models parsed from prisma/schema.prisma", file=sys.stderr)
        return 2

    problems: list[tuple[str, int, str, str]] = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith((".ts", ".tsx")) or ".test." in fn:
                continue
            path = os.path.join(root, fn)
            try:
                src = Path(path).read_text()
            except Exception:
                continue
            lines = src.split("\n")
            for i, line in enumerate(lines):
                fm = re.search(r"\.from\(['\"`](\w+)['\"`]\)", line)
                if not fm:
                    continue
                table = fm.group(1)
                if table not in table_cols:
                    continue
                window = " ".join(lines[i : i + 10])
                sm = re.search(r"\.select\(\s*['\"`]([^'\"`]+)['\"`]", window)
                if not sm:
                    continue
                inner = sm.group(1)
                # Skip selectors that contain a template-literal
                # expression like `${prefColumn}` — the actual column
                # name is resolved at runtime and can't be statically
                # checked here.
                if "${" in inner:
                    continue
                for col in split_top_level_commas(inner):
                    if not col or col == "*":
                        continue
                    # Skip relation aliases + nested column lists — those
                    # belong to a different table.
                    if ":" in col or "(" in col:
                        continue
                    if col not in table_cols[table]:
                        problems.append((path, i + 1, table, col))

    if not problems:
        print(f"OK — checked {sum(len(c) for c in table_cols.values())} schema columns across {len(table_cols)} tables.")
        return 0

    print(f"Found {len(problems)} unknown column reference(s):")
    for p, ln, tbl, col in problems:
        print(f"  {p}:{ln}: select '{col}' from '{tbl}' — not in schema")
    return 1


if __name__ == "__main__":
    sys.exit(main())
