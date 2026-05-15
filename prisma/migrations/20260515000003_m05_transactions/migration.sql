-- TenureIQ M5 — Transactions & category-rule memory.
--
-- Changes:
--   - bank_accounts: kind, opening_balance_pence/_date, notes added
--   - transactions: entity_id, external_id (dedup), split_parent_id,
--     plus useful composite indexes
--   - new table transaction_category_rules — auto-categorisation memory
--   - RLS + audit triggers on the new table
--   - CHECK constraints for the controlled enums

set search_path = public;

-- =========================================================================
-- 1. bank_accounts: new columns.
-- =========================================================================

alter table bank_accounts
  add column if not exists kind text not null default 'current',
  add column if not exists opening_balance_pence bigint not null default 0,
  add column if not exists opening_balance_date date,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bank_accounts_kind_check'
      and conrelid = 'bank_accounts'::regclass
  ) then
    alter table bank_accounts
      add constraint bank_accounts_kind_check
      check (kind in ('current','savings','client_money','tenant_deposit'));
  end if;
end$$;

-- =========================================================================
-- 2. transactions: new columns + indexes.
-- =========================================================================

alter table transactions
  add column if not exists entity_id uuid references entities(id) on update cascade,
  add column if not exists external_id text,
  add column if not exists split_parent_id uuid references transactions(id) on update cascade;

create index if not exists transactions_organisation_deleted_idx
  on transactions (organisation_id, deleted_at);

create index if not exists transactions_organisation_posted_idx
  on transactions (organisation_id, posted_at desc);

create index if not exists transactions_entity_id_idx on transactions (entity_id);
create index if not exists transactions_split_parent_idx on transactions (split_parent_id);

-- Dedup: same bank account + same external_id is unique.
-- Postgres treats NULL as distinct in UNIQUE by default, so rows without
-- external_id won't conflict.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_bank_external_unique'
      and conrelid = 'transactions'::regclass
  ) then
    alter table transactions
      add constraint transactions_bank_external_unique
      unique (bank_account_id, external_id);
  end if;
end$$;

-- CHECK on category_code — the controlled enum lives in code; we keep
-- a permissive shape in SQL (any non-empty string) so a category added
-- in code doesn't require a migration to use.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_category_code_not_empty'
      and conrelid = 'transactions'::regclass
  ) then
    alter table transactions
      add constraint transactions_category_code_not_empty
      check (length(category_code) > 0);
  end if;
end$$;

-- =========================================================================
-- 3. transaction_category_rules — auto-categorisation memory.
-- =========================================================================

create table if not exists transaction_category_rules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on update cascade,

  pattern         text not null,
  is_regex        boolean not null default false,
  sign_required   text check (sign_required is null or sign_required in ('credit','debit')),
  category_code   text not null,
  property_id     uuid references properties(id) on update cascade,

  hit_count       integer not null default 0,
  last_matched_at timestamptz(6),

  created_at      timestamptz(6) not null default current_timestamp,
  updated_at      timestamptz(6) not null default current_timestamp,
  deleted_at      timestamptz(6)
);

create index if not exists transaction_category_rules_org_idx
  on transaction_category_rules (organisation_id);
create index if not exists transaction_category_rules_org_deleted_idx
  on transaction_category_rules (organisation_id, deleted_at);
create index if not exists transaction_category_rules_org_hits_idx
  on transaction_category_rules (organisation_id, hit_count desc);

alter table transaction_category_rules enable row level security;

create policy "transaction_category_rules_select" on transaction_category_rules
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );

create policy "transaction_category_rules_select_archived" on transaction_category_rules
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create policy "transaction_category_rules_insert" on transaction_category_rules
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );

create policy "transaction_category_rules_update" on transaction_category_rules
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );

create policy "transaction_category_rules_delete" on transaction_category_rules
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

-- Standard audit trigger (this table carries organisation_id directly).
drop trigger if exists transaction_category_rules_audit on transaction_category_rules;
create trigger transaction_category_rules_audit
  after insert or update or delete on transaction_category_rules
  for each row execute function audit_log_trigger();
