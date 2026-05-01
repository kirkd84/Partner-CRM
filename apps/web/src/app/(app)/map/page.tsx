import { Prisma, prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { Card, Pill, EmptyState } from '@partnerradar/ui';
import { AlertTriangle, ExternalLink, MapPin } from 'lucide-react';
import { STAGE_COLORS, STAGE_LABELS, PARTNER_TYPE_LABELS } from '@partnerradar/types';
import Link from 'next/link';
import { MapView } from './MapView';

export const dynamic = 'force-dynamic';

export default async function MapPage() {
  const session = await auth();
  if (!session?.user) return null;
  const isAdmin = session.user.role === 'ADMIN';

  const where: Prisma.PartnerWhereInput = {
    marketId: { in: session.user.markets },
    archivedAt: null,
  };
  if (session.user.role === 'REP') {
    where.OR = [{ assignedRepId: session.user.id }, { assignedRepId: null }];
  }

  const [partners, markets] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        publicId: true,
        companyName: true,
        partnerType: true,
        stage: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        lat: true,
        lng: true,
      },
      take: 2000,
    }),
    prisma.market.findMany({
      where: { id: { in: session.user.markets } },
      select: { id: true, name: true, defaultCenter: true },
    }),
  ]);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const keyConfigured = apiKey.length > 0;

  const withCoords = partners.filter((p) => p.lat != null && p.lng != null);
  const withoutCoords = partners.filter((p) => p.lat == null || p.lng == null);

  // Prefer the first market's default center; fall back to Wheat Ridge, CO.
  let defaultCenter = { lat: 39.7661, lng: -105.0772 };
  const first = markets[0]?.defaultCenter as { lat?: number; lng?: number } | null;
  if (first && typeof first.lat === 'number' && typeof first.lng === 'number') {
    defaultCenter = { lat: first.lat, lng: first.lng };
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Map</h1>
          <p className="text-xs text-gray-500">
            Partners colored by stage. Click <strong>Lasso a territory</strong> to draw a polygon
            and turn it into today&apos;s hit list.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Pill tone="soft" color="blue">
            {withCoords.length} mappable
          </Pill>
          {withoutCoords.length > 0 && (
            <Pill tone="soft" color="gray">
              {withoutCoords.length} need geocoding
            </Pill>
          )}
        </div>
      </header>

      {!keyConfigured && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900">Google Maps key not configured</div>
            <div className="mt-0.5 text-xs text-amber-800">
              The map is rendering as a list until the <code>GOOGLE_MAPS_API_KEY</code> env var is
              set on Railway. Enable the Maps JavaScript, Drawing, Places, and Directions APIs when
              you issue the key.
              {isAdmin && (
                <span className="mt-1 block">
                  Go to Railway → Variables → add <code>GOOGLE_MAPS_API_KEY</code>, redeploy. The
                  rest of the map (lasso, prospect pins, deep-link routing) lights up once the key
                  is in place.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        {keyConfigured ? (
          <MapView
            apiKey={apiKey}
            defaultCenter={defaultCenter}
            marketId={markets[0]?.id ?? null}
            partners={withCoords.map((p) => ({
              id: p.id,
              publicId: p.publicId,
              companyName: p.companyName,
              partnerType: p.partnerType,
              stage: p.stage,
              lat: p.lat as number,
              lng: p.lng as number,
              city: p.city,
              state: p.state,
            }))}
          />
        ) : (
          <FallbackPinList
            partners={partners.map((p) => ({
              id: p.id,
              publicId: p.publicId,
              companyName: p.companyName,
              partnerType: p.partnerType,
              stage: p.stage,
              address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(', '),
            }))}
          />
        )}
      </div>
    </div>
  );
}

function FallbackPinList({
  partners,
}: {
  partners: {
    id: string;
    publicId: string;
    companyName: string;
    partnerType: keyof typeof PARTNER_TYPE_LABELS;
    stage: keyof typeof STAGE_LABELS;
    address: string;
  }[];
}) {
  if (partners.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No partners to pin yet"
          description="Add partners in your market and they'll appear here as pins (and as rows while the map key is unconfigured)."
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-gray-100">
        {partners.map((p) => (
          <li key={p.id} className="flex items-start gap-3 py-2">
            <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/partners/${p.id}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {p.companyName}
                </Link>
                <span className="font-mono text-[11px] text-gray-400">{p.publicId}</span>
                <Pill tone="soft" color={STAGE_COLORS[p.stage]}>
                  {STAGE_LABELS[p.stage]}
                </Pill>
              </div>
              <div className="truncate text-[11px] text-gray-500">
                {PARTNER_TYPE_LABELS[p.partnerType]}
                {p.address ? ` · ${p.address}` : ' · Address unknown'}
              </div>
            </div>
            {p.address && (
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(p.address)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
              >
                <ExternalLink className="h-3 w-3" /> Google Maps
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
