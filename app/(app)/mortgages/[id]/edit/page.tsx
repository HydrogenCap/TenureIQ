import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { MortgageForm, type PropertyOption } from '../../_components/mortgage-form'
import type { MortgageCreate, MortgageProduct } from '@/lib/schemas/mortgage'

type DbRow = {
  id: string
  property_id: string
  lender: string
  account_ref: string | null
  product: string
  original_loan_pence: string | number
  current_balance_pence: string | number
  interest_rate_bps: number
  monthly_payment_pence: string | number
  term_months: number
  fixed_end_date: string | null
  is_interest_only: boolean
  broker: string | null
  notes: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function EditMortgagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/mortgages/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('mortgages')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()
  if (!data) notFound()

  const { data: rawProps } = await sb
    .from('properties')
    .select('id, address_line_1, postcode')
    .is('deleted_at', null)
    .order('address_line_1')

  const properties = ((rawProps ?? []) as Array<{
    id: string
    address_line_1: string
    postcode: string
  }>).map<PropertyOption>((p) => ({
    id: p.id,
    addressLine1: p.address_line_1,
    postcode: p.postcode,
  }))

  const initial: MortgageCreate = {
    propertyId: data.property_id,
    lender: data.lender,
    accountRef: data.account_ref,
    product: data.product as MortgageProduct,
    originalLoanPence: toBig(data.original_loan_pence),
    currentBalancePence: toBig(data.current_balance_pence),
    interestRateBps: data.interest_rate_bps,
    monthlyPaymentPence: toBig(data.monthly_payment_pence),
    termMonths: data.term_months,
    fixedEndDate: data.fixed_end_date ? new Date(data.fixed_end_date) : null,
    isInterestOnly: data.is_interest_only,
    broker: data.broker,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit mortgage`} description={data.lender} />
      <MortgageForm mode="edit" mortgageId={id} properties={properties} initial={initial} />
    </div>
  )
}
