'use client';

/**
 * Inline tag editor for the partner header.
 *
 * Click "+ tag" → input appears; press Enter to add, click ✕ on a chip
 * to remove. Adding a tag fires the ON_TAG_ADDED drip enrollment on
 * the server side; nothing the editor needs to know about.
 */

import { useState, useTransition } from 'react';
import { Plus, X, Tag as TagIcon } from 'lucide-react';
import { addPartnerTag, removePartnerTag } from './actions';

interface Props {
  partnerId: string;
  initialTags: string[];
  canEdit: boolean;
}

export function PartnerTagsEditor({ partnerId, initialTags, canEdit }: Props) {
  const [tags, setTags] = useState(initialTags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const value = draft.trim();
    setError(null);
    if (!value) {
      setAdding(false);
      setDraft('');
      return;
    }
    if (tags.includes(value)) {
      setAdding(false);
      setDraft('');
      return;
    }
    start(async () => {
      try {
        const r = await addPartnerTag(partnerId, value);
        setTags((prev) => (prev.includes(r.tag) ? prev : [...prev, r.tag]));
        setDraft('');
        setAdding(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add tag');
      }
    });
  }

  function remove(tag: string) {
    start(async () => {
      try {
        await removePartnerTag(partnerId, tag);
        setTags((prev) => prev.filter((t) => t !== tag));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove tag');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagIcon className="h-3 w-3 text-gray-400" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200"
        >
          {tag}
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(tag)}
              className="hover:text-red-600"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {canEdit && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10.5px] text-gray-500 hover:border-primary hover:text-primary"
        >
          <Plus className="h-2.5 w-2.5" /> tag
        </button>
      )}
      {adding && (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setAdding(false);
              setDraft('');
            }
          }}
          onBlur={commit}
          placeholder="tag name"
          className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] focus:border-primary focus:ring-1 focus:ring-primary"
        />
      )}
      {error && <span className="text-[10.5px] text-red-600">{error}</span>}
    </div>
  );
}
