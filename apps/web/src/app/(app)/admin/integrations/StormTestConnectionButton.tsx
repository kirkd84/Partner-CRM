'use client';
import { useState, useTransition } from 'react';
import { Button } from '@partnerradar/ui';
import { PlugZap, RefreshCw } from 'lucide-react';
import { testStormConnection, syncAllStormRevenueNow } from './actions';

export function StormTestConnectionButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, startSync] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            startSync(async () => {
              setSyncResult(null);
              try {
                const r = await syncAllStormRevenueNow();
                if (r.partnerCount === 0) {
                  setSyncResult('No activated partners yet — nothing to sync.');
                } else if (r.ok) {
                  setSyncResult(
                    `Synced ${r.partnerCount} partner${r.partnerCount === 1 ? '' : 's'}: ${r.totalRows} rows total, ${r.totalNew} new.`,
                  );
                } else {
                  setSyncResult(
                    `Completed with ${r.failures} failure${r.failures === 1 ? '' : 's'}. First error: ${r.firstError ?? 'unknown'}`,
                  );
                }
              } catch (err) {
                setSyncResult(err instanceof Error ? err.message : 'Sync failed');
              }
            })
          }
          loading={isSyncing}
          title="Pull revenue for every activated partner right now"
        >
          <RefreshCw className="h-4 w-4" /> Sync revenue now
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            startTransition(async () => {
              setResult(null);
              try {
                const res = await testStormConnection();
                setResult(res);
              } catch (err) {
                setResult({
                  ok: false,
                  message: err instanceof Error ? err.message : 'Unknown error',
                });
              }
            })
          }
          loading={isPending}
        >
          <PlugZap className="h-4 w-4" /> Test connection
        </Button>
      </div>
      {result && (
        <span
          className={`max-w-sm text-right text-[11px] ${
            result.ok ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {result.message}
        </span>
      )}
      {syncResult && (
        <span className="max-w-sm text-right text-[11px] text-gray-600">{syncResult}</span>
      )}
    </div>
  );
}
