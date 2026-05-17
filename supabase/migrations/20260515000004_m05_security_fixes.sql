-- TenureIQ M5 security fixes — migration-reviewer follow-up on commit 0f932bb.
--
-- 1. Three FKs added in 20260515000003_m05_transactions did not specify
--    ON DELETE explicitly. Postgres defaults to NO ACTION, which behaves
--    like RESTRICT at commit time but is brittle — a future reader could
--    reasonably assume CASCADE. Make the intent explicit.
-- 2. The unique constraint `(bank_account_id, external_id)` relied on
--    Postgres' default NULLS DISTINCT semantics so multiple manual
--    transactions with no external_id wouldn't collide. Replace with an
--    explicit partial index that ignores NULLs, surviving any future
--    toggle of NULLS NOT DISTINCT.

set search_path = public;

-- =========================================================================
-- 1. Re-create FKs with explicit ON DELETE RESTRICT.
--    Drop the old (defaulted) FKs and re-add them with the explicit clause.
-- =========================================================================

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'transactions'::regclass
      and contype = 'f'
      and conname in (
        'transactions_entity_id_fkey',
        'transactions_property_id_fkey',
        'transactions_split_parent_id_fkey'
      )
  loop
    execute format('alter table transactions drop constraint %I', con.conname);
  end loop;
end$$;

alter table transactions
  add constraint transactions_entity_id_fkey
    foreign key (entity_id) references entities(id)
    on update cascade on delete restrict;

alter table transactions
  add constraint transactions_property_id_fkey
    foreign key (property_id) references properties(id)
    on update cascade on delete restrict;

alter table transactions
  add constraint transactions_split_parent_id_fkey
    foreign key (split_parent_id) references transactions(id)
    on update cascade on delete restrict;

-- =========================================================================
-- 2. Replace the (bank_account_id, external_id) unique constraint with
--    an explicit partial index ignoring NULLs.
-- =========================================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'transactions_bank_external_unique'
      and conrelid = 'transactions'::regclass
  ) then
    alter table transactions drop constraint transactions_bank_external_unique;
  end if;
end$$;

create unique index if not exists transactions_bank_external_unique_idx
  on transactions (bank_account_id, external_id)
  where external_id is not null;
