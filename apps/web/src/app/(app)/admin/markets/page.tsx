import { prisma } from '@partnerradar/db';
import { Table, THead, TBody, TR, TH, TD } from '@partnerradar/ui';
import { MapPinned } from 'lucide-react';
import { MarketsToolbar, MarketRowActions } from './MarketsClient';

export const dynamic = 'force-dynamic';

type CenterJson = { lat: number; lng: number };

export default async function AdminMarketsPage() {
  const markets = await prisma.market.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { partners: true, users: true } },
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Markets</h1>
          <p className="text-xs text-gray-500">
            {markets.length} market{markets.length === 1 ? '' : 's'} · scrape radius shown in miles
          </p>
        </div>
        <div className="ml-auto">
          <MarketsToolbar />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Timezone</TH>
              <TH>Map center</TH>
              <TH>Scrape radius</TH>
              <TH>Partners</TH>
              <TH>Users</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {markets.map((m) => {
              const center = (m.defaultCenter as CenterJson | null) ?? null;
              return (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                        <MapPinned className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium text-gray-900">{m.name}</span>
                    </div>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-gray-600">{m.timezone}</span>
                  </TD>
                  <TD>
                    {center ? (
                      <span className="font-mono text-xs text-gray-600">
                        {center.lat.toFixed(3)}, {center.lng.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TD>
                  <TD>
                    <span className="text-xs text-gray-700">{m.scrapeRadius} mi</span>
                  </TD>
                  <TD>
                    <span className="text-xs text-gray-700">{m._count.partners}</span>
                  </TD>
                  <TD>
                    <span className="text-xs text-gray-700">{m._count.users}</span>
                  </TD>
                  <TD className="text-right">
                    <MarketRowActions
                      market={{
                        id: m.id,
                        name: m.name,
                        timezone: m.timezone,
                        centerLat: center?.lat ?? 0,
                        centerLng: center?.lng ?? 0,
                        scrapeRadius: m.scrapeRadius,
                        physicalAddress: m.physicalAddress ?? '',
                      }}
                      canDelete={m._count.partners === 0 && m._count.users === 0}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
