-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "plan_tier" TEXT NOT NULL DEFAULT 'trial',
    "trial_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_members" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "companies_house_number" TEXT,
    "registered_address" TEXT,
    "hmrc_utr" TEXT,
    "vat_number" TEXT,
    "year_end_month" INTEGER,
    "year_end_day" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholders" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "share_count" INTEGER NOT NULL,
    "share_class" TEXT NOT NULL DEFAULT 'ordinary',
    "is_director" BOOLEAN NOT NULL DEFAULT false,
    "appointed_date" DATE,
    "resigned_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "entity_id" UUID,
    "label" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_number_last4" TEXT,
    "sort_code_masked" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "postcode" TEXT NOT NULL,
    "local_authority" TEXT,
    "brma_code" TEXT,
    "kind" TEXT NOT NULL,
    "class_use" TEXT,
    "bedrooms_total" INTEGER,
    "bathrooms_total" INTEGER,
    "internal_area_sqm" DECIMAL(8,2),
    "purchase_price_pence" BIGINT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "sdlt_paid_pence" BIGINT,
    "refurb_cost_pence" BIGINT,
    "acquisition_costs_pence" BIGINT,
    "current_valuation_pence" BIGINT,
    "current_valuation_as_of" DATE,
    "hmo_licence_kind" TEXT,
    "hmo_licence_ref" TEXT,
    "hmo_licence_expiry" DATE,
    "hmo_permitted_occupancy" INTEGER,
    "epc_rating" TEXT,
    "epc_expiry" DATE,
    "article_4_area" BOOLEAN NOT NULL DEFAULT false,
    "is_aasc_property" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "bathrooms_ensuite" BOOLEAN NOT NULL DEFAULT false,
    "floor_area_sqm" DECIMAL(6,2),
    "market_rent_pence" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'vacant',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "right_to_rent_checked" BOOLEAN NOT NULL DEFAULT false,
    "right_to_rent_expiry" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancies" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_id" UUID,
    "tenant_id" UUID,
    "kind" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "rent_pence" BIGINT NOT NULL,
    "rent_period" TEXT NOT NULL DEFAULT 'monthly',
    "deposit_pence" BIGINT,
    "deposit_scheme_ref" TEXT,
    "deposit_scheme" TEXT,
    "aasc_placement_ref" TEXT,
    "aasc_contractor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortgages" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "lender" TEXT NOT NULL,
    "account_ref" TEXT,
    "original_loan_pence" BIGINT NOT NULL,
    "current_balance_pence" BIGINT NOT NULL,
    "interest_rate_bps" INTEGER NOT NULL,
    "monthly_payment_pence" BIGINT NOT NULL,
    "product" TEXT NOT NULL,
    "fixed_end_date" DATE,
    "term_months" INTEGER NOT NULL,
    "is_interest_only" BOOLEAN NOT NULL DEFAULT false,
    "broker" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "mortgages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortgage_events" (
    "id" UUID NOT NULL,
    "mortgage_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "balance_pence" BIGINT,
    "rate_post_bps" INTEGER,
    "amount_pence" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mortgage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "valuation_date" DATE NOT NULL,
    "value_pence" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "bank_account_id" UUID,
    "property_id" UUID,
    "posted_at" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount_pence" BIGINT NOT NULL,
    "category_code" TEXT NOT NULL,
    "reference" TEXT,
    "reconciled_at" TIMESTAMPTZ(6),
    "import_batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "director_loans" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "director_name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_pence" BIGINT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "director_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_capital_accounts" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "investor_name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_pence" BIGINT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "investor_capital_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_id" UUID,
    "kind" TEXT NOT NULL,
    "issue_date" DATE,
    "expiry_date" DATE,
    "status" TEXT NOT NULL,
    "issuer" TEXT,
    "document_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_jobs" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'reported',
    "reported_date" DATE NOT NULL,
    "completed_date" DATE,
    "contractor_name" TEXT,
    "cost_estimate_pence" BIGINT,
    "cost_actual_pence" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "maintenance_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE,
    "assignee_user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "related_kind" TEXT,
    "related_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "related_kind" TEXT NOT NULL,
    "related_id" UUID NOT NULL,
    "trigger_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "channel" TEXT NOT NULL DEFAULT 'email',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID,
    "storage_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_by_user_id" UUID,
    "kind" TEXT,
    "ocr_status" TEXT NOT NULL DEFAULT 'pending',
    "ocr_text" TEXT,
    "ocr_extracted_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "organisation_id" UUID,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aasc_contracts" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "contractor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "monthly_headline_pence" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "aasc_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aasc_areas" (
    "id" UUID NOT NULL,
    "contractor" TEXT NOT NULL,
    "local_authority" TEXT NOT NULL,
    "status" TEXT,
    "demand_pending" INTEGER,
    "pipeline" INTEGER,
    "note" TEXT,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aasc_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aasc_placements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "contract_id" UUID,
    "tenancy_id" UUID,
    "property_id" UUID NOT NULL,
    "placement_ref" TEXT NOT NULL,
    "weekly_rate_pence" BIGINT NOT NULL,
    "service_user_count" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "aasc_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lha_rates" (
    "id" UUID NOT NULL,
    "brma_code" TEXT NOT NULL,
    "beds" TEXT NOT NULL,
    "weekly_pence" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lha_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organisation_members_user_id_idx" ON "organisation_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_members_organisation_id_user_id_key" ON "organisation_members"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_organisation_id_idx" ON "invitations"("organisation_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "entities_organisation_id_idx" ON "entities"("organisation_id");

-- CreateIndex
CREATE INDEX "entities_organisation_id_deleted_at_idx" ON "entities"("organisation_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "entities_organisation_id_companies_house_number_key" ON "entities"("organisation_id", "companies_house_number");

-- CreateIndex
CREATE INDEX "shareholders_entity_id_idx" ON "shareholders"("entity_id");

-- CreateIndex
CREATE INDEX "bank_accounts_organisation_id_idx" ON "bank_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "bank_accounts_entity_id_idx" ON "bank_accounts"("entity_id");

-- CreateIndex
CREATE INDEX "properties_organisation_id_idx" ON "properties"("organisation_id");

-- CreateIndex
CREATE INDEX "properties_organisation_id_deleted_at_idx" ON "properties"("organisation_id", "deleted_at");

-- CreateIndex
CREATE INDEX "properties_entity_id_idx" ON "properties"("entity_id");

-- CreateIndex
CREATE INDEX "properties_postcode_idx" ON "properties"("postcode");

-- CreateIndex
CREATE INDEX "units_property_id_idx" ON "units"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_property_id_label_key" ON "units"("property_id", "label");

-- CreateIndex
CREATE INDEX "tenants_organisation_id_idx" ON "tenants"("organisation_id");

-- CreateIndex
CREATE INDEX "tenants_organisation_id_deleted_at_idx" ON "tenants"("organisation_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tenancies_organisation_id_idx" ON "tenancies"("organisation_id");

-- CreateIndex
CREATE INDEX "tenancies_property_id_idx" ON "tenancies"("property_id");

-- CreateIndex
CREATE INDEX "tenancies_unit_id_idx" ON "tenancies"("unit_id");

-- CreateIndex
CREATE INDEX "tenancies_tenant_id_idx" ON "tenancies"("tenant_id");

-- CreateIndex
CREATE INDEX "tenancies_start_date_idx" ON "tenancies"("start_date");

-- CreateIndex
CREATE INDEX "mortgages_organisation_id_idx" ON "mortgages"("organisation_id");

-- CreateIndex
CREATE INDEX "mortgages_property_id_idx" ON "mortgages"("property_id");

-- CreateIndex
CREATE INDEX "mortgages_fixed_end_date_idx" ON "mortgages"("fixed_end_date");

-- CreateIndex
CREATE INDEX "mortgage_events_mortgage_id_idx" ON "mortgage_events"("mortgage_id");

-- CreateIndex
CREATE INDEX "valuations_organisation_id_idx" ON "valuations"("organisation_id");

-- CreateIndex
CREATE INDEX "valuations_property_id_idx" ON "valuations"("property_id");

-- CreateIndex
CREATE INDEX "valuations_valuation_date_idx" ON "valuations"("valuation_date");

-- CreateIndex
CREATE INDEX "transactions_organisation_id_idx" ON "transactions"("organisation_id");

-- CreateIndex
CREATE INDEX "transactions_property_id_idx" ON "transactions"("property_id");

-- CreateIndex
CREATE INDEX "transactions_posted_at_idx" ON "transactions"("posted_at");

-- CreateIndex
CREATE INDEX "transactions_category_code_idx" ON "transactions"("category_code");

-- CreateIndex
CREATE INDEX "director_loans_organisation_id_idx" ON "director_loans"("organisation_id");

-- CreateIndex
CREATE INDEX "director_loans_entity_id_idx" ON "director_loans"("entity_id");

-- CreateIndex
CREATE INDEX "investor_capital_accounts_organisation_id_idx" ON "investor_capital_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "investor_capital_accounts_entity_id_idx" ON "investor_capital_accounts"("entity_id");

-- CreateIndex
CREATE INDEX "compliance_items_organisation_id_idx" ON "compliance_items"("organisation_id");

-- CreateIndex
CREATE INDEX "compliance_items_property_id_idx" ON "compliance_items"("property_id");

-- CreateIndex
CREATE INDEX "compliance_items_expiry_date_idx" ON "compliance_items"("expiry_date");

-- CreateIndex
CREATE INDEX "compliance_items_kind_idx" ON "compliance_items"("kind");

-- CreateIndex
CREATE INDEX "maintenance_jobs_organisation_id_idx" ON "maintenance_jobs"("organisation_id");

-- CreateIndex
CREATE INDEX "maintenance_jobs_property_id_idx" ON "maintenance_jobs"("property_id");

-- CreateIndex
CREATE INDEX "maintenance_jobs_status_idx" ON "maintenance_jobs"("status");

-- CreateIndex
CREATE INDEX "tasks_organisation_id_idx" ON "tasks"("organisation_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_user_id_idx" ON "tasks"("assignee_user_id");

-- CreateIndex
CREATE INDEX "reminders_organisation_id_idx" ON "reminders"("organisation_id");

-- CreateIndex
CREATE INDEX "reminders_trigger_at_idx" ON "reminders"("trigger_at");

-- CreateIndex
CREATE INDEX "reminders_related_kind_related_id_idx" ON "reminders"("related_kind", "related_id");

-- CreateIndex
CREATE INDEX "documents_organisation_id_idx" ON "documents"("organisation_id");

-- CreateIndex
CREATE INDEX "documents_property_id_idx" ON "documents"("property_id");

-- CreateIndex
CREATE INDEX "documents_kind_idx" ON "documents"("kind");

-- CreateIndex
CREATE INDEX "audit_log_table_name_row_id_idx" ON "audit_log"("table_name", "row_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_log_organisation_id_idx" ON "audit_log"("organisation_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "aasc_contracts_organisation_id_idx" ON "aasc_contracts"("organisation_id");

-- CreateIndex
CREATE INDEX "aasc_areas_contractor_local_authority_idx" ON "aasc_areas"("contractor", "local_authority");

-- CreateIndex
CREATE UNIQUE INDEX "aasc_areas_contractor_local_authority_effective_date_key" ON "aasc_areas"("contractor", "local_authority", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "aasc_placements_tenancy_id_key" ON "aasc_placements"("tenancy_id");

-- CreateIndex
CREATE INDEX "aasc_placements_organisation_id_idx" ON "aasc_placements"("organisation_id");

-- CreateIndex
CREATE INDEX "aasc_placements_property_id_idx" ON "aasc_placements"("property_id");

-- CreateIndex
CREATE INDEX "lha_rates_brma_code_beds_idx" ON "lha_rates"("brma_code", "beds");

-- CreateIndex
CREATE UNIQUE INDEX "lha_rates_brma_code_beds_effective_from_key" ON "lha_rates"("brma_code", "beds", "effective_from");

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortgage_events" ADD CONSTRAINT "mortgage_events_mortgage_id_fkey" FOREIGN KEY ("mortgage_id") REFERENCES "mortgages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "director_loans" ADD CONSTRAINT "director_loans_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "director_loans" ADD CONSTRAINT "director_loans_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_capital_accounts" ADD CONSTRAINT "investor_capital_accounts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_capital_accounts" ADD CONSTRAINT "investor_capital_accounts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aasc_contracts" ADD CONSTRAINT "aasc_contracts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aasc_placements" ADD CONSTRAINT "aasc_placements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aasc_placements" ADD CONSTRAINT "aasc_placements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "aasc_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aasc_placements" ADD CONSTRAINT "aasc_placements_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aasc_placements" ADD CONSTRAINT "aasc_placements_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

