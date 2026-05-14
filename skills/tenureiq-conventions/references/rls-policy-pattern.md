# RLS Policy Pattern — The Four-Policy Template

Apply this template without modification on every domain table. If you need to deviate, document why in the migration SQL comment.

## The template

For a table `<table_name>` with `organisation_id uuid` and `deleted_at timestamptz null`:

```sql
-- Enable RLS
alter table public.<table_name> enable row level security;

-- SELECT: members can read undeleted rows in their org
create policy "<table_name>_select" on public.<table_name>
  for select
  using (
    organisation_id in (
      select organisation_id
      from public.organisation_members
      where user_id = auth.uid()
        and accepted_at is not null
    )
    and deleted_at is null
  );

-- INSERT: managers, admins, owners can insert into their org
create policy "<table_name>_insert" on public.<table_name>
  for insert
  with check (
    organisation_id in (
      select organisation_id
      from public.organisation_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
        and accepted_at is not null
    )
  );

-- UPDATE: same audience as insert; also can soft-delete (set deleted_at)
create policy "<table_name>_update" on public.<table_name>
  for update
  using (
    organisation_id in (
      select organisation_id
      from public.organisation_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
        and accepted_at is not null
    )
  )
  with check (
    organisation_id in (
      select organisation_id
      from public.organisation_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
        and accepted_at is not null
    )
  );

-- DELETE: only owners and admins, for hard-delete cases (rare)
create policy "<table_name>_delete" on public.<table_name>
  for delete
  using (
    organisation_id in (
      select organisation_id
      from public.organisation_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
        and accepted_at is not null
    )
  );
```

## Why each piece exists

- `accepted_at is not null` — invited but not yet accepted members cannot read or write. Pending invitations don't grant access.
- `deleted_at is null` in select — soft-deleted rows are invisible to normal reads. Admin tooling that needs to see them uses Prisma with the service role.
- Role gradient on write — viewers and accountants can read but not modify operational data. Customise per table if needed (e.g. accountants might be able to insert into `transactions`).
- `with check` and `using` both specified on update — `using` controls which rows can be updated; `with check` controls what the row can be updated to. Both prevent "stealing" rows into another org.

## Performance: the membership subquery

The repeated subquery `select organisation_id from organisation_members where user_id = auth.uid()` runs for every row evaluated. For tables with many rows, wrap in a Postgres function with `STABLE` so it caches within a statement:

```sql
create or replace function public.current_user_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.organisation_members
  where user_id = auth.uid()
    and accepted_at is not null
$$;

revoke all on function public.current_user_orgs() from public;
grant execute on function public.current_user_orgs() to authenticated;

-- Then in policies:
-- using (organisation_id in (select * from public.current_user_orgs()) and deleted_at is null)
```

For role-gated policies, similar helper:

```sql
create or replace function public.current_user_orgs_with_role(roles text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.organisation_members
  where user_id = auth.uid()
    and role = any(roles)
    and accepted_at is not null
$$;
```

## The audit trigger

```sql
create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  if TG_OP = 'INSERT' then
    v_after := to_jsonb(NEW);
    v_before := null;
  elsif TG_OP = 'UPDATE' then
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    v_before := to_jsonb(OLD);
    v_after := null;
  end if;

  insert into public.audit_log (actor_user_id, action, table_name, row_id, before, after)
  values (
    v_actor,
    TG_OP,
    TG_TABLE_NAME,
    coalesce((NEW.id)::uuid, (OLD.id)::uuid),
    v_before,
    v_after
  );

  return coalesce(NEW, OLD);
end;
$$;

-- Apply to a table:
create trigger <table_name>_audit
after insert or update or delete on public.<table_name>
for each row execute function public.audit_log_trigger();
```

Apply triggers selectively to high-value tables: `properties`, `mortgages`, `valuations`, `tenancies`, `transactions`, `entities`, `compliance_items`. Audit-log every row mutation on these.

## The tenant-isolation test (mandatory before merging any table)

```ts
// tests/e2e/<resource>-isolation.spec.ts
import { test, expect } from '@playwright/test'

test('org A cannot read org B properties', async ({ page }) => {
  // Sign in as user in org A, create a property
  await loginAs('a@example.com')
  const propertyId = await createTestProperty('Org A Property')

  // Sign in as user in org B, try to read
  await loginAs('b@example.com')
  const response = await fetch(`/api/properties/${propertyId}`)
  expect(response.status).toBe(404)  // not 403 — should be invisible

  // Also verify list endpoint returns 0
  const list = await fetch('/api/properties').then(r => r.json())
  expect(list.data).toHaveLength(0)
})
```

Run this once per table that holds tenant data. The pattern is identical; only the resource name changes.

## Common mistakes (refuse to write)

1. `auth.uid() = user_id` style policies on tables that don't have `user_id`. Use the organisation membership join.
2. Forgetting `with check` on update policy — allows row-theft into another org.
3. Adding RLS without the audit trigger on high-value tables.
4. Using the JWT claim `role` (which is just `'authenticated'`) instead of the membership table's `role`.
5. Granting `service_role` execute on the membership helper — it doesn't need it and creates accidental escalation paths.
6. Returning 403 instead of 404 for cross-org reads. 404 is correct: the row should be invisible, not "forbidden".
