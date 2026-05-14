# Transaction CSV Imports

Bank statement imports (M5) are higher-stakes than property imports: thousands of rows, multiple banks each with their own column format, and the user wants the system to remember category mappings between sessions.

## Bank format detection

UK bank exports vary wildly. Don't ask the user to manually map columns every time — detect by header signature.

```ts
// lib/csv/bank-formats.ts
export type BankFormat = {
  id: string
  label: string
  matches: (headers: string[]) => boolean
  map: (row: Record<string, string>) => {
    posted_at: string
    description: string
    amount_pence: bigint
    reference?: string
  }
}

const lower = (a: string[]) => a.map((s) => s.toLowerCase().trim())

export const BANK_FORMATS: BankFormat[] = [
  {
    id: 'monzo',
    label: 'Monzo CSV export',
    matches: (h) => lower(h).includes('transaction id') && lower(h).includes('amount'),
    map: (r) => ({
      posted_at: r['Date'],
      description: r['Description'] || r['Name'],
      amount_pence: BigInt(Math.round(Number(r['Amount']) * 100)),
      reference: r['Reference'] || r['Transaction ID'],
    }),
  },
  {
    id: 'starling',
    label: 'Starling Business CSV',
    matches: (h) => lower(h).includes('counter party') && lower(h).includes('amount (gbp)'),
    map: (r) => ({
      posted_at: r['Date'],
      description: r['Counter Party'] || r['Reference'],
      amount_pence: BigInt(Math.round(Number(r['Amount (GBP)']) * 100)),
      reference: r['Reference'],
    }),
  },
  {
    id: 'hsbc',
    label: 'HSBC export',
    matches: (h) => {
      const l = lower(h)
      return l.includes('date') && l.includes('description') && l.includes('paid in') && l.includes('paid out')
    },
    map: (r) => {
      const paidIn = Number(r['Paid In'] || '0')
      const paidOut = Number(r['Paid Out'] || '0')
      return {
        posted_at: r['Date'],
        description: r['Description'],
        amount_pence: BigInt(Math.round((paidIn - paidOut) * 100)),
      }
    },
  },
  // ... add more as users import them
]

export function detectFormat(headers: string[]): BankFormat | null {
  return BANK_FORMATS.find((f) => f.matches(headers)) ?? null
}
```

When no format matches, fall back to a manual column-mapping UI (see `column-mapping.md`).

## Category memory

Users want "Direct Debit ABC FINANCE" to auto-categorise as `mortgage_payment` the second time they see it. Persist these mappings:

```prisma
// add to schema.prisma
model TransactionCategoryRule {
  id              String   @id @default(uuid()) @db.Uuid
  organisationId  String   @map("organisation_id") @db.Uuid
  matchPattern    String   @map("match_pattern")  // regex or substring
  matchKind       String   @default("substring") @map("match_kind")  // substring | regex
  categoryCode    String   @map("category_code")
  propertyId      String?  @map("property_id") @db.Uuid  // optional auto-assignment
  isUserOverride  Boolean  @default(false) @map("is_user_override")
  hits            Int      @default(0)  // for ranking / cleanup

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organisation    Organisation @relation(fields: [organisationId], references: [id])

  @@map("transaction_category_rules")
  @@index([organisationId])
  @@index([organisationId, matchPattern])
}
```

Apply rules in priority order (user overrides first, then most-hit rules) on each parsed row:

```ts
// lib/csv/categorise.ts
export function categoriseTransaction(
  description: string,
  rules: Array<{ matchPattern: string; matchKind: string; categoryCode: string; propertyId: string | null }>
): { categoryCode: string; propertyId: string | null } | null {
  for (const rule of rules) {
    if (rule.matchKind === 'regex') {
      try {
        if (new RegExp(rule.matchPattern, 'i').test(description)) {
          return { categoryCode: rule.categoryCode, propertyId: rule.propertyId }
        }
      } catch { /* invalid regex — skip */ }
    } else {
      if (description.toLowerCase().includes(rule.matchPattern.toLowerCase())) {
        return { categoryCode: rule.categoryCode, propertyId: rule.propertyId }
      }
    }
  }
  return null
}
```

After the user manually categorises a row in the preview, offer "Also categorise future transactions matching 'XYZ' as 'mortgage_payment'" — that's how the rules table grows.

## Canonical category codes

Use a fixed set, not free-text, so reports can aggregate consistently:

```ts
export const TRANSACTION_CATEGORIES = [
  { code: 'rent', label: 'Rent received', sign: 'credit' },
  { code: 'mortgage_payment', label: 'Mortgage payment', sign: 'debit' },
  { code: 'mortgage_interest_only', label: 'Mortgage — interest only', sign: 'debit' },
  { code: 'maintenance', label: 'Maintenance & repairs', sign: 'debit' },
  { code: 'insurance', label: 'Insurance', sign: 'debit' },
  { code: 'utilities', label: 'Utilities (landlord-paid)', sign: 'debit' },
  { code: 'council_tax', label: 'Council tax (landlord-paid)', sign: 'debit' },
  { code: 'agent_fees', label: 'Agent management fees', sign: 'debit' },
  { code: 'legal_professional', label: 'Legal & professional fees', sign: 'debit' },
  { code: 'compliance_certs', label: 'Compliance certificates (gas/EICR/EPC)', sign: 'debit' },
  { code: 'hmo_licence_fee', label: 'HMO licence fee', sign: 'debit' },
  { code: 'capital_drawdown', label: 'Mortgage drawdown', sign: 'credit' },
  { code: 'capital_repayment', label: 'Capital repayment', sign: 'debit' },
  { code: 'director_loan_in', label: 'Director loan in', sign: 'credit' },
  { code: 'director_loan_out', label: 'Director loan out', sign: 'debit' },
  { code: 'investor_contribution', label: 'Investor contribution', sign: 'credit' },
  { code: 'investor_distribution', label: 'Investor distribution', sign: 'debit' },
  { code: 'sdlt', label: 'SDLT', sign: 'debit' },
  { code: 'acquisition_costs', label: 'Acquisition costs (legal, survey)', sign: 'debit' },
  { code: 'refurb', label: 'Refurbishment (capital)', sign: 'debit' },
  { code: 'tax_payment', label: 'Tax payment (CT / SA)', sign: 'debit' },
  { code: 'other', label: 'Other', sign: 'either' },
] as const

export type CategoryCode = typeof TRANSACTION_CATEGORIES[number]['code']
```

## Property assignment

Many transactions belong to a specific property (rent for `12 Holmer Road`, maintenance at `Bryanstone Close`). The preview should let users assign per-row, with memory:

- A description matching "12 HOLMER" → suggest property `12 Holmer Road, Hereford`.
- After the user confirms, write a rule with `propertyId` set.

This makes the second statement import vastly faster than the first.

## Staging table (for two-phase commit)

Bank statements are larger and messier than property lists. Instead of inserting straight into `transactions`, stage into a `transaction_imports` table first:

```prisma
model TransactionImport {
  id                 String   @id @default(uuid()) @db.Uuid
  organisationId     String   @map("organisation_id") @db.Uuid
  bankAccountId      String   @map("bank_account_id") @db.Uuid
  filename           String
  rowCount           Int      @map("row_count")
  importedRowCount   Int      @default(0) @map("imported_row_count")
  status             String   @default("staging")  // staging|previewing|committed|rejected
  format             String?  // monzo|starling|hsbc|manual

  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  committedAt        DateTime? @map("committed_at") @db.Timestamptz(6)

  organisation       Organisation @relation(fields: [organisationId], references: [id])
  rows               TransactionImportRow[]

  @@map("transaction_imports")
  @@index([organisationId])
}

model TransactionImportRow {
  id                String   @id @default(uuid()) @db.Uuid
  importId          String   @map("import_id") @db.Uuid
  rowIndex          Int      @map("row_index")
  rawJson           Json     @map("raw_json")
  postedAt          DateTime @map("posted_at") @db.Date
  description       String
  amountPence       BigInt   @map("amount_pence")
  reference         String?
  categoryCode      String?  @map("category_code")
  propertyId        String?  @map("property_id") @db.Uuid
  status            String   @default("pending")  // pending|approved|skipped|duplicate

  import            TransactionImport @relation(fields: [importId], references: [id])

  @@map("transaction_import_rows")
  @@index([importId])
}
```

Workflow:

1. Upload → create `TransactionImport` + N `TransactionImportRow`.
2. Preview shows rows with auto-categorisation. User adjusts categories and property assignments.
3. Commit: insert into `transactions`, mark `TransactionImport.status = 'committed'`, increment `transaction_category_rules.hits` for matched rules.
4. Duplicate detection: row hash on `(posted_at, amount_pence, description)` checked against existing transactions; flagged but not auto-skipped.

The staging table is also where the user can "re-categorise" rows from a past import without re-uploading. It becomes audit trail too.

## Duplicate detection

Bank exports overlap if the user re-exports a longer date range. Detect via:

```sql
-- A row is a "probable duplicate" if a transaction exists with:
-- same bank_account_id, same posted_at, same amount_pence, similar description
select id from transactions
where bank_account_id = $1
  and posted_at = $2
  and amount_pence = $3
  and similarity(description, $4) > 0.7  -- pg_trgm extension
  and deleted_at is null
```

Enable `pg_trgm` in a migration; surface "Likely duplicate of transaction on 12 Feb" in the preview.

## Anti-patterns

1. **Inserting straight to `transactions`.** Use the staging pattern — gives the user a way back if they realise the categorisation is wrong.
2. **Hardcoded bank format detection in component code.** Use the registry pattern so adding a new bank is one file change.
3. **Suggested categorisation that auto-commits without review.** Always require the user to confirm; surfacing the suggestion is enough.
4. **Free-text category column on transactions.** Use a controlled enum — see `TRANSACTION_CATEGORIES` above.
5. **One giant INSERT for 10,000 rows.** Chunked inserts (500 rows per batch) with progress feedback is mandatory at this scale.
