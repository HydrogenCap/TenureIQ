-- TenureIQ M11 — Investor capital accounts.
--
-- The foundation shipped a single flat `investor_capital_accounts`
-- table that conflated the investor record with their transaction
-- ledger. M11 separates the three concepts cleanly:
--
--   investors                — the legal person / SPV / company.
--   investor_capital_accounts — one row per investor × entity, holds
--                              the terms JSON, commitment, kind.
--   investor_transactions     — the append-mostly ledger of cash and
--                              non-cash events against an account.
--   investor_kyc_log          — audit log of every read of KYC data
--                              (tax_id etc) for compliance.
--
-- No production data on the legacy table yet (the foundation
-- migration hasn't been applied to a live DB), so we drop and rebuild
-- rather than carrying the old shape forward.

set search_path = public;

-- =========================================================================
-- Drop the legacy table. CASCADE removes the audit trigger row.
-- =========================================================================

drop table if exists investor_capital_accounts cascade;

-- =========================================================================
-- 1. investors
-- =========================================================================

create table investors (
  id                uuid         not null primary key default gen_random_uuid(),
  organisation_id   uuid         not null references organisations(id) on update cascade,

  name              text         not null,
  kind              text         not null check (kind in ('individual','entity','spv')),
  contact_email     text,
  contact_phone     text,
  address_line_1    text,
  address_line_2    text,
  city              text,
  postcode          text,
  country           text         default 'GB',

  -- KYC fields — restricted via role-gated reads, NEVER exposed to
  -- non-admin members. RLS is enforced at row level but the read
  -- redaction happens in application code (see /investors detail).
  tax_id            text,
  date_of_birth     date,
  national_id_kind  text,        -- ni|company_utr|passport
  notes             text,

  created_at        timestamptz(6) not null default current_timestamp,
  updated_at        timestamptz(6) not null default current_timestamp,
  deleted_at        timestamptz(6)
);

create index investors_organisation_id_idx          on investors(organisation_id);
create index investors_organisation_id_deleted_idx  on investors(organisation_id, deleted_at);
create index investors_name_idx                     on investors(organisation_id, name);

alter table investors enable row level security;

create policy "investors_select" on investors
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );
create policy "investors_select_archived" on investors
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );
create policy "investors_insert" on investors
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );
create policy "investors_update" on investors
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );
create policy "investors_delete" on investors
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create trigger investors_audit
  after insert or update or delete on investors
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 2. investor_capital_accounts (rebuilt with the M11 shape)
-- =========================================================================

create table investor_capital_accounts (
  id                uuid         not null primary key default gen_random_uuid(),
  organisation_id   uuid         not null references organisations(id) on update cascade,
  investor_id       uuid         not null references investors(id) on update cascade on delete restrict,
  entity_id         uuid         not null references entities(id) on update cascade on delete restrict,

  kind              text         not null check (kind in (
    'preferred_equity','common_equity','mezzanine_loan','straight_loan'
  )),
  terms             jsonb        not null default '{}'::jsonb,
  commitment_pence  bigint       not null check (commitment_pence >= 0),
  start_date        date         not null,
  end_date          date,
  status            text         not null default 'open' check (status in ('open','closed','defaulted')),

  created_at        timestamptz(6) not null default current_timestamp,
  updated_at        timestamptz(6) not null default current_timestamp,
  deleted_at        timestamptz(6)
);

create index investor_capital_accounts_org_idx on investor_capital_accounts(organisation_id);
create index investor_capital_accounts_org_deleted_idx on investor_capital_accounts(organisation_id, deleted_at);
create index investor_capital_accounts_investor_idx on investor_capital_accounts(investor_id);
create index investor_capital_accounts_entity_idx on investor_capital_accounts(entity_id);

alter table investor_capital_accounts enable row level security;

create policy "investor_accounts_select" on investor_capital_accounts
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );
create policy "investor_accounts_select_archived" on investor_capital_accounts
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );
create policy "investor_accounts_insert" on investor_capital_accounts
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );
create policy "investor_accounts_update" on investor_capital_accounts
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager']))
  );
create policy "investor_accounts_delete" on investor_capital_accounts
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create trigger investor_capital_accounts_audit
  after insert or update or delete on investor_capital_accounts
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 3. investor_transactions (the ledger)
-- =========================================================================

create table investor_transactions (
  id                uuid         not null primary key default gen_random_uuid(),
  organisation_id       uuid         not null references organisations(id) on update cascade,
  account_id            uuid         not null references investor_capital_accounts(id) on update cascade on delete restrict,

  kind                  text         not null check (kind in (
    'contribution','distribution','interest_accrual','fee','redemption','adjustment'
  )),
  transaction_date      date         not null,
  -- Signed bigint. Convention: contributions positive (cash in from the
  -- investor's perspective is also "balance up" from the entity's
  -- perspective if you think of the account as the investor's balance).
  -- Distributions negative. We document this once here and follow it
  -- everywhere — see lib/domain/investor.ts.
  amount_pence          bigint       not null,
  linked_transaction_id uuid         references transactions(id) on update cascade on delete set null,
  source_document_id    uuid         references documents(id) on update cascade on delete set null,
  notes                 text,

  created_at            timestamptz(6) not null default current_timestamp,
  updated_at            timestamptz(6) not null default current_timestamp,
  deleted_at            timestamptz(6)
);

create index investor_transactions_org_idx on investor_transactions(organisation_id);
create index investor_transactions_org_deleted_idx on investor_transactions(organisation_id, deleted_at);
create index investor_transactions_account_idx on investor_transactions(account_id);
create index investor_transactions_account_date_idx on investor_transactions(account_id, transaction_date);
create index investor_transactions_linked_idx on investor_transactions(linked_transaction_id)
  where linked_transaction_id is not null;

alter table investor_transactions enable row level security;

create policy "investor_transactions_select" on investor_transactions
  for select using (
    organisation_id in (select * from current_user_orgs())
    and deleted_at is null
  );
create policy "investor_transactions_select_archived" on investor_transactions
  for select using (
    deleted_at is not null
    and organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );
create policy "investor_transactions_insert" on investor_transactions
  for insert with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant']))
  );
create policy "investor_transactions_update" on investor_transactions
  for update using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant']))
  ) with check (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin','manager','accountant']))
  );
create policy "investor_transactions_delete" on investor_transactions
  for delete using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

create trigger investor_transactions_audit
  after insert or update or delete on investor_transactions
  for each row execute function audit_log_trigger();

-- =========================================================================
-- 4. investor_kyc_log — append-only audit of every read of KYC data
-- =========================================================================

create table investor_kyc_log (
  id                bigserial    primary key,
  organisation_id   uuid         not null references organisations(id) on update cascade,
  investor_id       uuid         not null references investors(id) on update cascade,
  actor_user_id     uuid,
  accessed_field    text         not null,
  -- The route handler logs this on the investor detail page render.
  -- One row per session-level access, not per-render — avoids log
  -- spam on hot reload.
  accessed_at       timestamptz(6) not null default current_timestamp
);

create index investor_kyc_log_org_idx on investor_kyc_log(organisation_id);
create index investor_kyc_log_investor_idx on investor_kyc_log(investor_id);
create index investor_kyc_log_accessed_at_idx on investor_kyc_log(accessed_at desc);

alter table investor_kyc_log enable row level security;

-- Service-role-only writes; owners can read for compliance review.
-- No insert / update / delete from the user-facing client at all —
-- writes go through lib/admin/* on the server.
create policy "investor_kyc_log_select" on investor_kyc_log
  for select using (
    organisation_id in (select * from current_user_orgs_with_role(array['owner','admin']))
  );

comment on table investor_kyc_log is
  'Append-only audit of KYC field reads. Writes ONLY via lib/admin/ '
  '(service role). User-facing client has SELECT for owner/admin only. '
  'Per CLAUDE.md non-negotiable #5 — audit on data-protection-sensitive '
  'columns.';

-- =========================================================================
-- 5. organisation_members.notify_investor_statements — opt-in flag for
--    quarterly statement reminders (the email side is M11 follow-up).
-- =========================================================================

alter table organisation_members
  add column if not exists notify_investor_statements boolean not null default false;
