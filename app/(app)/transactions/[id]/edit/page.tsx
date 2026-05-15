import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { TransactionForm } from '../../_components/transaction-form'
import type { TransactionCreate } from '@/lib/schemas/transaction'
import { TRANSACTION_CATEGORIES, type CategoryCode } from '@/lib/domain/transactions'

type DbRow = {
  id: string
  bank_account_id: string | null
  property_id: string | null
  posted_at: string
  description: string
  amount_pence: string | number
  category_code: string
  reference: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect(`/transactions/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('transactions')
    .select(
      'id, bank_account_id, property_id, posted_at, description, amount_pence, category_code, reference',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const [accountsRes, propertiesRes] = await Promise.all([
    sb
      .from('bank_accounts')
      .select('id, label')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('label'),
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
  ])

  const bankAccounts = ((accountsRes.data ?? []) as Array<{ id: string; label: string }>).map(
    (a) => ({ id: a.id, name: a.label }),
  )
  const properties = (
    (propertiesRes.data ?? []) as Array<{ id: string; address_line_1: string; postcode: string }>
  ).map((p) => ({ id: p.id, name: `${p.address_line_1}, ${p.postcode}` }))

  const knownCategory: CategoryCode = TRANSACTION_CATEGORIES.includes(
    data.category_code as CategoryCode,
  )
    ? (data.category_code as CategoryCode)
    : 'uncategorised'

  const initial: TransactionCreate = {
    bankAccountId: data.bank_account_id,
    postedAt: new Date(data.posted_at),
    description: data.description,
    amountPence: toBig(data.amount_pence),
    categoryCode: knownCategory,
    propertyId: data.property_id,
    reference: data.reference,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Edit transaction" />
      <TransactionForm
        mode="edit"
        transactionId={id}
        bankAccounts={bankAccounts}
        properties={properties}
        initial={initial}
      />
    </div>
  )
}
