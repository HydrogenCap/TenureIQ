import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { ContractForm } from '../../_components/contract-form'
import type {
  AascContractCreate,
  AascContractor,
  AascContractKind,
} from '@/lib/schemas/aasc'

type DbRow = {
  id: string
  entity_id: string | null
  contractor: string
  kind: string
  reference: string | null
  start_date: string
  end_date: string | null
  break_clause_date: string | null
  contracted_rate_pence_per_week: string | number | null
  commission_rate_bps: number
  payment_terms_days: number
  payable_bank_account_id: string | null
  monthly_headline_pence: string | number | null
  notes: string | null
}

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/aasc/contracts/${id}`)

  const sb = await supabaseServer()
  const [contractRes, entitiesRes, banksRes] = await Promise.all([
    sb
      .from('aasc_contracts')
      .select(
        'id, entity_id, contractor, kind, reference, start_date, end_date, break_clause_date, contracted_rate_pence_per_week, commission_rate_bps, payment_terms_days, payable_bank_account_id, monthly_headline_pence, notes',
      )
      .eq('id', id)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<DbRow>(),
    sb
      .from('entities')
      .select('id, name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
    sb
      .from('bank_accounts')
      .select('id, label, bank_name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('label'),
  ])

  const data = contractRes.data
  if (!data) notFound()

  const entities = ((entitiesRes.data ?? []) as Array<{ id: string; name: string }>).map(
    (e) => ({ id: e.id, name: e.name }),
  )
  const bankAccounts = (
    (banksRes.data ?? []) as Array<{ id: string; label: string; bank_name: string | null }>
  ).map((b) => ({ id: b.id, name: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label }))

  const initial: AascContractCreate = {
    entityId: data.entity_id,
    contractor: data.contractor as AascContractor,
    kind: data.kind as AascContractKind,
    reference: data.reference,
    startDate: new Date(data.start_date),
    endDate: data.end_date ? new Date(data.end_date) : null,
    breakClauseDate: data.break_clause_date ? new Date(data.break_clause_date) : null,
    contractedRatePencePerWeek: toBig(data.contracted_rate_pence_per_week),
    commissionRateBps: data.commission_rate_bps,
    paymentTermsDays: data.payment_terms_days,
    payableBankAccountId: data.payable_bank_account_id,
    monthlyHeadlinePence: toBig(data.monthly_headline_pence),
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${data.contractor}`} />
      <ContractForm
        mode="edit"
        contractId={id}
        entities={entities}
        bankAccounts={bankAccounts}
        initial={initial}
      />
    </div>
  )
}
