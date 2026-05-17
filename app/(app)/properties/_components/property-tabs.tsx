// app/(app)/properties/_components/property-tabs.tsx
import { Suspense } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Tabs, type TabDef } from '@/components/ui/tabs'
import { OverviewTab } from './tabs/overview-tab'
import { UnitsTab } from '../[id]/_components/units-tab'
import { TenanciesTab } from '../[id]/_components/tenancies-tab'
import { FinanceTab } from '../[id]/_components/finance-tab'
import { ComplianceTab } from '../[id]/_components/compliance-tab'
import { DocumentsTab } from '../[id]/_components/documents-tab'
import { AascTab } from '../[id]/_components/aasc-tab'

type Property = Parameters<typeof OverviewTab>[0]['property']

function buildTabs(isAasc: boolean): TabDef[] {
  const base: TabDef[] = [
    { tabKey: 'overview', label: 'Overview' },
    { tabKey: 'units', label: 'Units' },
    { tabKey: 'tenancies', label: 'Tenancies' },
    { tabKey: 'finance', label: 'Finance' },
    { tabKey: 'compliance', label: 'Compliance' },
  ]
  if (isAasc) base.push({ tabKey: 'aasc', label: 'AASC' })
  base.push({ tabKey: 'maintenance', label: 'Maintenance' })
  base.push({ tabKey: 'documents', label: 'Documents' })
  return base
}

function TabSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-10 animate-pulse rounded bg-muted" />
      <div className="h-10 animate-pulse rounded bg-muted" />
      <div className="h-10 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function PropertyTabs({
  activeTab,
  property,
  propertyId,
}: {
  activeTab: string
  property: Property
  propertyId: string
}) {
  const tabs = buildTabs(property.isAascProperty)
  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} defaultTabKey="overview" />

      {activeTab === 'overview' && <OverviewTab property={property} />}

      {activeTab === 'units' && (
        <Suspense fallback={<TabSkeleton />}>
          <UnitsTab propertyId={propertyId} />
        </Suspense>
      )}

      {activeTab === 'tenancies' && (
        <Suspense fallback={<TabSkeleton />}>
          <TenanciesTab propertyId={propertyId} />
        </Suspense>
      )}

      {activeTab === 'finance' && (
        <Suspense fallback={<TabSkeleton />}>
          <FinanceTab propertyId={propertyId} />
        </Suspense>
      )}
      {activeTab === 'compliance' && (
        <Suspense fallback={<TabSkeleton />}>
          <ComplianceTab propertyId={propertyId} />
        </Suspense>
      )}
      {activeTab === 'aasc' && property.isAascProperty && (
        <Suspense fallback={<TabSkeleton />}>
          <AascTab propertyId={propertyId} />
        </Suspense>
      )}
      {activeTab === 'maintenance' && (
        <EmptyState title="Maintenance" description="Available in M9 — maintenance kanban." />
      )}
      {activeTab === 'documents' && (
        <Suspense fallback={<TabSkeleton />}>
          <DocumentsTab propertyId={propertyId} />
        </Suspense>
      )}
    </div>
  )
}
