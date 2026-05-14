// app/(app)/properties/_components/tabs/overview-tab.tsx
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'

type Property = {
  addressLine1: string
  addressLine2: string | null
  city: string
  county: string | null
  postcode: string
  localAuthority: string | null
  kind: string
  bedroomsTotal: number | null
  bathroomsTotal: number | null
  purchasePricePence: bigint
  purchaseDate: string
  sdltPaidPence: bigint | null
  refurbCostPence: bigint | null
  acquisitionCostsPence: bigint | null
  epcRating: string | null
  epcExpiry: string | null
  hmoLicenceKind: string
  hmoLicenceRef: string | null
  hmoLicenceExpiry: string | null
  hmoPermittedOccupancy: number | null
  article4Area: boolean
  isAascProperty: boolean
  notes: string | null
}

export function OverviewTab({ property }: { property: Property }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <Section title="Address">
        <Row label="Line 1" rowValue={property.addressLine1} />
        <Row label="Line 2" rowValue={property.addressLine2} />
        <Row label="City" rowValue={property.city} />
        <Row label="County" rowValue={property.county} />
        <Row label="Postcode" rowValue={property.postcode} />
        <Row label="Local authority" rowValue={property.localAuthority} />
      </Section>

      <Section title="Acquisition">
        <Row label="Purchase price" rowValue={<MoneyDisplay pence={property.purchasePricePence} />} />
        <Row label="Purchase date" rowValue={<DateDisplay date={property.purchaseDate} />} />
        <Row label="SDLT paid" rowValue={<MoneyDisplay pence={property.sdltPaidPence} />} />
        <Row label="Refurb" rowValue={<MoneyDisplay pence={property.refurbCostPence} />} />
        <Row label="Other costs" rowValue={<MoneyDisplay pence={property.acquisitionCostsPence} />} />
      </Section>

      <Section title="Energy">
        <Row label="EPC rating" rowValue={property.epcRating} />
        <Row label="EPC expiry" rowValue={<DateDisplay date={property.epcExpiry} distance />} />
      </Section>

      <Section title="HMO & planning">
        <Row label="HMO licence" rowValue={property.hmoLicenceKind} />
        {property.hmoLicenceKind !== 'none' && (
          <>
            <Row label="Licence ref" rowValue={property.hmoLicenceRef} />
            <Row label="Expiry" rowValue={<DateDisplay date={property.hmoLicenceExpiry} distance />} />
            <Row label="Permitted occupancy" rowValue={property.hmoPermittedOccupancy} />
          </>
        )}
        <Row label="Article 4" rowValue={property.article4Area ? 'Yes' : 'No'} />
        <Row label="AASC property" rowValue={property.isAascProperty ? 'Yes' : 'No'} />
      </Section>

      <Section title="Sizing">
        <Row label="Bedrooms" rowValue={property.bedroomsTotal} />
        <Row label="Bathrooms" rowValue={property.bathroomsTotal} />
        <Row label="Kind" rowValue={property.kind} />
      </Section>

      {property.notes && (
        <div className="sm:col-span-2">
          <h3 className="mb-2 text-base font-medium">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{property.notes}</p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-base font-medium">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  )
}

function Row({
  label,
  rowValue,
}: {
  label: string
  rowValue: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{rowValue ?? '—'}</dd>
    </div>
  )
}
