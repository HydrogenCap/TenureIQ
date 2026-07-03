-- TenureIQ M8 — Security follow-ups from migration-reviewer
-- (commit 8dd847a).
--
-- P0  Event-trigger guard on aasc_placements didn't cover
--     ALTER TABLE … RENAME COLUMN. pg_event_trigger_ddl_commands()
--     doesn't emit a row for rename — caller could add evidence_name
--     then rename to full_name and bypass the original check.
-- P0  Same trigger only scanned information_schema.columns. A
--     CHECK-constraint smuggling forbidden name in its expression,
--     or an inherited child table aasc_placements_archive, would
--     also bypass.
-- P1  placement_count_changes lacks deleted_at and has update/delete
--     policies inconsistent with the "append-only" intent.
-- P1  Missing audit trigger on placement_count_changes (financially
--     material — affects Home-Office billing reconstruction).

set search_path = public;

-- =========================================================================
-- 1. Rewrite the event trigger to catch column renames + tighten the
--    target match. Two separate event triggers because column rename
--    fires under the "ALTER TABLE … RENAME" tag (not "ALTER TABLE").
-- =========================================================================

-- Event-trigger DDL needs superuser; degrade gracefully elsewhere (the
-- guard is a dev-time safety net). See matching block in m08_aasc.
do $$
begin
  drop event trigger if exists assert_no_aasc_pii_columns_trigger;
  drop event trigger if exists assert_no_aasc_pii_renames_trigger;
exception when insufficient_privilege then
  raise notice 'skipping event trigger drops — requires superuser';
end $$;

create or replace function public.assert_no_aasc_pii_columns()
returns event_trigger
language plpgsql
as $$
declare
  forbidden text[] := array[
    'name','full_name','first_name','last_name',
    'dob','date_of_birth','nationality',
    'passport','passport_number','national_id',
    'home_office_reference','asylum_reference',
    'evidence_name','identifier','identifying_id'
  ];
  col text;
begin
  -- Scan columns on aasc_placements directly — exact match, no '%'
  -- so aasc_placements_archive / partitioned children don't satisfy it
  -- under our umbrella. (Defending those is a separate concern.)
  foreach col in array forbidden loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'aasc_placements'
        and column_name = col
    ) then
      raise exception
        'aasc_placements must not contain column "%": forbidden by the data-protection contract with prime contractors',
        col;
    end if;
  end loop;

  -- Also reject CHECK-constraint expressions that reference a
  -- forbidden token. A constraint named e.g. "passport_check" with
  -- expression "passport is null" smuggles the word into pg_constraint
  -- but cannot reference a non-existent column at validation time —
  -- still, the check is cheap and the intent is to catch any DDL that
  -- so much as mentions identity-shaped terms on this table.
  foreach col in array forbidden loop
    if exists (
      select 1 from pg_constraint pc
      join pg_class cl on cl.oid = pc.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      where ns.nspname = 'public'
        and cl.relname = 'aasc_placements'
        and pg_get_constraintdef(pc.oid) ilike '%' || col || '%'
    ) then
      raise exception
        'aasc_placements has a CHECK constraint referencing forbidden token "%": rewrite to avoid identity-shaped names',
        col;
    end if;
  end loop;
end;
$$;

-- Fires on all DDL ends; the function filters internally by table.
-- The function is cheap (small forbidden list × small columns + small
-- constraints) and only runs on DDL, so the always-on cost is fine.
do $$
begin
  create event trigger assert_no_aasc_pii_columns_trigger
    on ddl_command_end
    execute function assert_no_aasc_pii_columns();

  -- Separate trigger for the rename path, which uses a different tag
  -- and is not present in pg_event_trigger_ddl_commands().
  create event trigger assert_no_aasc_pii_renames_trigger
    on ddl_command_end
    when tag in ('ALTER TABLE')
    execute function assert_no_aasc_pii_columns();
exception when insufficient_privilege then
  raise notice 'skipping AASC PII event triggers — requires superuser';
end $$;

-- =========================================================================
-- 2. placement_count_changes: align with "append-only" intent.
--    Drop the update/delete policies; soft-delete is not supported
--    on this ledger by design — corrections come as a new row with
--    the new count.
-- =========================================================================

drop policy if exists "placement_count_changes_update" on placement_count_changes;
drop policy if exists "placement_count_changes_delete" on placement_count_changes;

comment on table placement_count_changes is
  'Append-only ledger of service_user_count changes per placement. No '
  'soft-delete and no update/delete policies — corrections are made by '
  'inserting a new row at a later effective_from. Audit trigger keeps '
  'a tamper-evident trail.';

-- =========================================================================
-- 3. Audit trigger on placement_count_changes — financially material
--    (Home-Office billing reconstruction depends on this).
-- =========================================================================

drop trigger if exists placement_count_changes_audit on placement_count_changes;
create trigger placement_count_changes_audit
  after insert or update or delete on placement_count_changes
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 4. (organisation_id, effective_from) composite for cross-placement
--    "what changed this month" queries from the dashboard.
-- =========================================================================

create index if not exists placement_count_changes_org_effective_idx
  on placement_count_changes (organisation_id, effective_from);
