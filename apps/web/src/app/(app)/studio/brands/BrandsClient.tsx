'use client';

/**
 * /studio/brands client — cards for each workspace, with a brand table
 * per workspace. Admin-only buttons for approve / archive / set-default
 * are inline on each row.
 */

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { approveBrand, archiveBrand, setDefaultBrand } from '../brand-actions';

interface BrandRow {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
  createdAt: string;
  companyName: string | null;
  primaryHex: string | null;
  secondaryHex: string | null;
  sampleCount: number;
  designCount: number;
}
interface WorkspaceRow {
  workspaceId: string;
  workspaceName: string;
  marketName: string;
  brands: BrandRow[];
}

export function BrandsClient({
  workspaces,
  canEdit,
}: {
  workspaces: WorkspaceRow[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  if (workspaces.length === 0) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No Marketing Wizard workspaces yet. Workspaces are auto-created per market on server boot.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-canvas p-6">
      {err ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      ) : null}
      <div className="space-y-5">
        {workspaces.map((ws) => (
          <section
            key={ws.workspaceId}
            className="overflow-hidden rounded-md border border-card-border bg-white"
          >
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-label text-gray-500">Workspace</p>
                <h2 className="text-base font-semibold text-gray-900">{ws.workspaceName}</h2>
                <p className="text-[12px] text-gray-500">{ws.marketName}</p>
              </div>
              {canEdit && (
                <Link
                  href={`/studio/brand-setup?workspaceId=${ws.workspaceId}`}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  + Brand
                </Link>
              )}
            </header>

            {ws.brands.length === 0 ? (
              <div className="px-5 py-6 text-center text-[12px] text-gray-500">
                No brands yet. {canEdit ? 'Start one from the button above.' : ''}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-label text-gray-500">
                    <th className="px-5 py-2 font-medium">Brand</th>
                    <th className="px-5 py-2 font-medium">Colors</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 text-right font-medium">Samples</th>
                    <th className="px-5 py-2 text-right font-medium">Designs</th>
                    {canEdit ? <th className="px-5 py-2 font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {ws.brands.map((b) => (
                    <tr key={b.id} className="border-t border-gray-100">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{b.name}</span>
                          {b.isDefault ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Default
                            </span>
                          ) : null}
                        </div>
                        {b.companyName ? (
                          <p className="mt-0.5 text-[11px] text-gray-500">{b.companyName}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-1">
                          <Swatch hex={b.primaryHex} />
                          <Swatch hex={b.secondaryHex} />
                        </div>
                      </td>
                      <td className="px-5 py-2">
                        <StatusPill status={b.status} />
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-gray-700">
                        {b.sampleCount}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-gray-700">
                        {b.designCount}
                      </td>
                      {canEdit ? (
                        <td className="px-5 py-2 text-[11px]">
                          <div className="flex flex-wrap gap-2">
                            {b.status === 'TRAINING' && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => approveBrand(b.id))}
                                className="font-semibold text-emerald-700 hover:underline disabled:opacity-60"
                              >
                                Approve
                              </button>
                            )}
                            {b.status === 'ACTIVE' && !b.isDefault && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => setDefaultBrand(b.id))}
                                className="font-semibold text-indigo-700 hover:underline disabled:opacity-60"
                              >
                                Set default
                              </button>
                            )}
                            {b.status !== 'ARCHIVED' && !b.isDefault && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => archiveBrand(b.id))}
                                className="font-semibold text-red-600 hover:underline disabled:opacity-60"
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Swatch({ hex }: { hex: string | null }) {
  if (!hex) return <span className="text-[11px] text-gray-300">—</span>;
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-gray-200"
      style={{ backgroundColor: hex }}
      title={hex}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const c =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'TRAINING'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-500';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c}`}>{status}</span>
  );
}
