'use client';

/**
 * MW-4 lite: free-text refinement chat box. The user types something
 * like "make the headline more urgent" or "swap to the testimonial
 * template" and we re-run the director with the instruction appended
 * to the original purpose. Keeps the experience iterative instead of
 * one-shot.
 *
 * Without an Anthropic key the rule-based director still picks up
 * tone keywords from the instruction (urgent / formal / celebratory)
 * and adjusts mood-tag scoring accordingly — so refinement does
 * something useful even on day one.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { refineDesign } from '../actions';

const QUICK_NUDGES = [
  'Make the headline more urgent',
  'Try a more celebratory tone',
  'Swap to a different template',
  'Make the copy shorter',
  'Use a testimonial style',
];

export function DesignRefinement({ designId }: { designId: string }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Type what you want to change.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await refineDesign(designId, trimmed);
        setInstruction('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Refinement failed');
      }
    });
  }

  return (
    <div className="rounded-xl border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <div className="text-[11px] font-semibold uppercase tracking-label text-gray-500">
          Refine with a sentence
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(instruction);
        }}
        className="mt-2 flex items-stretch gap-2"
      >
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder='e.g. "make it more urgent" or "use a testimonial style"'
          disabled={isPending}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !instruction.trim()}
          aria-label="Apply refinement"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_NUDGES.map((n) => (
          <button
            key={n}
            type="button"
            disabled={isPending}
            onClick={() => send(n)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {n}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
