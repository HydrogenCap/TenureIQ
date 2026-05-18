-- TenureIQ M11 security fixes (migration-reviewer follow-up on
-- 20260515000012_m11_investors).
--
-- Note: the P0 (String → uuid) was patched in-place on the original
-- migration file because nothing has been applied yet. This file
-- carries the P1 + P2 follow-ups:
--   - Explicit ON DELETE RESTRICT on FKs to organisations / investors
--     (defaulted to NO ACTION — convention says be explicit).
--   - DB-level sign-of-amount CHECK on investor_transactions.
--   - jsonb_typeof('object') CHECK on investor_capital_accounts.terms.
--   - national_id_kind CHECK on investors.

set search_path = public;

-- =========================================================================
-- P1 — Explicit ON DELETE RESTRICT on FKs
-- =========================================================================

alter table investors
  drop constraint if exists investors_organisation_id_fkey;
alter table investors
  add constraint investors_organisation_id_fkey
  foreign key (organisation_id) references organisations(id)
  on update cascade on delete restrict;

alter table investor_capital_accounts
  drop constraint if exists investor_capital_accounts_organisation_id_fkey;
alter table investor_capital_accounts
  add constraint investor_capital_accounts_organisation_id_fkey
  foreign key (organisation_id) references organisations(id)
  on update cascade on delete restrict;

alter table investor_transactions
  drop constraint if exists investor_transactions_organisation_id_fkey;
alter table investor_transactions
  add constraint investor_transactions_organisation_id_fkey
  foreign key (organisation_id) references organisations(id)
  on update cascade on delete restrict;

alter table investor_kyc_log
  drop constraint if exists investor_kyc_log_organisation_id_fkey;
alter table investor_kyc_log
  add constraint investor_kyc_log_organisation_id_fkey
  foreign key (organisation_id) references organisations(id)
  on update cascade on delete restrict;

alter table investor_kyc_log
  drop constraint if exists investor_kyc_log_investor_id_fkey;
alter table investor_kyc_log
  add constraint investor_kyc_log_investor_id_fkey
  foreign key (investor_id) references investors(id)
  on update cascade on delete restrict;

-- =========================================================================
-- P1 — DB-level sign-of-amount invariant on investor_transactions
-- =========================================================================
--
-- App-layer enforcement was the previous P1. Per the codebase's
-- 49-finding history, financial invariants belong at the DB too.
-- `adjustment` is the documented escape hatch and stays unconstrained.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'investor_transactions_amount_sign_check'
      and conrelid = 'investor_transactions'::regclass
  ) then
    alter table investor_transactions
      add constraint investor_transactions_amount_sign_check
      check (
        kind = 'adjustment'
        or (kind in ('contribution','interest_accrual') and amount_pence >= 0)
        or (kind in ('distribution','fee','redemption')   and amount_pence <= 0)
      );
  end if;
end$$;

-- =========================================================================
-- P2 — terms must be a jsonb object (not array / string / scalar)
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'investor_capital_accounts_terms_object_check'
      and conrelid = 'investor_capital_accounts'::regclass
  ) then
    alter table investor_capital_accounts
      add constraint investor_capital_accounts_terms_object_check
      check (jsonb_typeof(terms) = 'object');
  end if;
end$$;

-- =========================================================================
-- P2 — national_id_kind enum CHECK
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'investors_national_id_kind_check'
      and conrelid = 'investors'::regclass
  ) then
    alter table investors
      add constraint investors_national_id_kind_check
      check (
        national_id_kind is null
        or national_id_kind in ('ni','company_utr','passport')
      );
  end if;
end$$;
