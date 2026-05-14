// app/(app)/properties/_components/property-tabs.tsx
import { EmptyState } from '@/components/empty-state'
import { Tabs, type TabDef } from '@/components/ui/tabs'
import { OverviewTab } from './tabs/overview-tab'

type Property = Parameters<typeof OverviewTab>[0]['property']

const TABS: TabDef[] = [
  { tabKey: 'overview', label: 'Overview' },
  { tabKey: 'units', label: 'Units' },
  { tabKey: 'finance', label: 'Finance' },
  { tabKey: 'compliance', label: 'Compliance' },
  { tabKey: 'maintenance', label: 'Maintenance' },
  { tabKey: 'documents', label: 'Documents' },
]

export function PropertyTabs({
  activeTab,
  property,
}: {
  activeTab: string
  property: Property
}) {
  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} defaultTabKey="overview" />

      {activeTab === 'overview' && <OverviewTab property={property} />}
      {activeTab === 'units' && (
        <EmptyState title="Units" description="Available in M3 — tenancies & units." />
      )}
      {activeTab === 'finance' && (
        <EmptyState title="Finance" description="Available in M4 — mortgages & valuations." />
      )}
      {activeTab === 'compliance' && (
        <EmptyState title="Compliance" description="Available in M6 — compliance & reminders." />
      )}
      {activeTab === 'maintenance' && (
        <EmptyState title="Maintenance" description="Available in M9 — maintenance kanban." />
      )}
      {activeTab === 'documents' && (
        <EmptyState title="Documents" description="Available in M7 — documents & OCR." />
      )}
    </div>
  )
}
