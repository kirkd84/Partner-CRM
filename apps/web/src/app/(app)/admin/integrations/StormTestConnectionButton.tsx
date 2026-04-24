'use client';
import { useState, useTransition } from 'react';
import { Button } from '@partnerradar/ui';
import { PlugZap } from 'lucide-react';
import { testStormConnection } from './actions';

export function StormTestConnectionButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
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
      {result && (
        <span
          className={`max-w-sm text-right text-[11px] ${
            result.ok ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
