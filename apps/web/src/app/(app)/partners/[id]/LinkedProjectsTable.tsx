import { Card, Table, THead, TBody, TR, TH, TD, EmptyState, Pill } from '@partnerradar/ui';
import { Briefcase } from 'lucide-react';
import type { StormProject } from '@partnerradar/integrations';

/**
 * Storm Cloud project roster for this partner. Matches Storm's grid
 * columns (Name / Primary Contact / Address / City / State / AR /
 * Status / Last Touched / Install Date / Sales Reps / Revenue /
 * Expenses / Insurance / Time in Status / Supplementer / Market).
 */
export function LinkedProjectsTable({
  projects,
  activated,
}: {
  projects: StormProject[];
  activated: boolean;
}) {
  if (!activated) {
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-gray-500" />
            Linked projects
          </span>
        }
      >
        <EmptyState
          title="Not activated yet"
          description="Activate this partner to pull their project roster from Storm Cloud."
        />
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-gray-500" />
            Linked projects
          </span>
        }
      >
        <EmptyState
          title="No projects yet"
          description="When this partner sends a referral into Storm Cloud, it lands here."
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-gray-500" />
          Linked projects
          <span className="text-[10.5px] uppercase tracking-label text-gray-400">
            {projects.length} from Storm Cloud
          </span>
        </span>
      }
    >
      <div className="-mx-4 overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Primary contact</TH>
              <TH>Address</TH>
              <TH>City</TH>
              <TH>State</TH>
              <TH className="text-right">AR Outstanding</TH>
              <TH>Status</TH>
              <TH>Last touched</TH>
              <TH>Install date</TH>
              <TH>Sales reps</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">Expenses</TH>
              <TH className="text-right">Insurance total</TH>
              <TH>Time in status</TH>
              <TH>Supplementer</TH>
              <TH>Market</TH>
            </TR>
          </THead>
          <TBody>
            {projects.map((p) => (
              <TR key={p.id}>
                <TD>
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <div className="font-mono text-[10px] text-gray-400">{p.id}</div>
                </TD>
                <TD>{p.primaryContact}</TD>
                <TD>{p.address}</TD>
                <TD>{p.city}</TD>
                <TD>
                  <span className="font-mono text-xs text-gray-600">{p.state}</span>
                </TD>
                <TD className="text-right">
                  <span
                    className={`font-mono text-xs ${p.arOutstanding > 0 ? 'text-amber-700' : 'text-green-700'}`}
                  >
                    {formatCurrency(p.arOutstanding)}
                  </span>
                </TD>
                <TD>
                  <Pill color={statusColor(p.status)} tone="soft">
                    {p.status}
                  </Pill>
                </TD>
                <TD>
                  <span className="text-xs text-gray-600">{timeAgo(p.lastTouchedAt)}</span>
                </TD>
                <TD>
                  {p.installDate ? (
                    <span className="text-xs text-gray-700">
                      {new Date(p.installDate).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TD>
                <TD>
                  <span className="text-xs text-gray-700">{p.salesReps.join(', ')}</span>
                </TD>
                <TD className="text-right font-mono text-xs text-gray-900">
                  {formatCurrency(p.revenue)}
                </TD>
                <TD className="text-right font-mono text-xs text-gray-600">
                  {formatCurrency(p.expenses)}
                </TD>
                <TD className="text-right font-mono text-xs text-gray-600">
                  {formatCurrency(p.insuranceTotal)}
                </TD>
                <TD>
                  <span className="text-xs text-gray-600">{p.timeInStatus}</span>
                </TD>
                <TD>
                  {p.supplementer ? (
                    <span className="text-xs text-gray-700">{p.supplementer}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TD>
                <TD>
                  <span className="text-xs text-gray-700">{p.market}</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'Lead':
      return '#6b7280';
    case 'Inspected':
      return '#3b82f6';
    case 'Contract':
      return '#8b5cf6';
    case 'Install Scheduled':
      return '#a855f7';
    case 'Installed':
      return '#10b981';
    case 'Supplement':
      return '#ec4899';
    case 'Reinspect':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const m = Math.floor(days / 30);
  return `${m} month${m === 1 ? '' : 's'} ago`;
}
