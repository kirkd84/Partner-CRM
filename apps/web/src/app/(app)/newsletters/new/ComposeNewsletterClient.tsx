'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Pill } from '@partnerradar/ui';
import { Send, Eye, Save, Mail, Bold, Italic, Link2, List, Heading2, Clock } from 'lucide-react';
import {
  createNewsletterDraft,
  previewAudience,
  sendNewsletter,
  sendNewsletterTest,
  type AudienceFilter,
} from '../actions';

interface OptionList {
  partnerTypes: Array<{ key: string; label: string }>;
  stages: Array<{ key: string; label: string }>;
  groups: Array<{ id: string; label: string }>;
}

export function ComposeNewsletterClient({ partnerTypes, stages, groups }: OptionList) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [pickedTypes, setPickedTypes] = useState<Set<string>>(new Set());
  const [pickedStages, setPickedStages] = useState<Set<string>>(new Set());
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());
  const [includeCustomers, setIncludeCustomers] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [preview, setPreview] = useState<{
    count: number;
    sample: Array<{ companyName: string; email: string }>;
  } | null>(null);
  const [isPreviewing, setPreviewing] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Auto-refresh preview when filters change. Debounced via the
  // setTimeout below so rapid toggle clicks don't slam the action.
  useEffect(() => {
    const filter = currentFilter();
    setPreviewing(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await previewAudience({ filter });
        setPreview(r);
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTypes, pickedStages, pickedGroups, includeCustomers, includeInactive]);

  function currentFilter(): AudienceFilter {
    return {
      partnerTypes: pickedTypes.size > 0 ? [...pickedTypes] : undefined,
      stages: pickedStages.size > 0 ? [...pickedStages] : undefined,
      groupIds: pickedGroups.size > 0 ? [...pickedGroups] : undefined,
      includeCustomers,
      includeInactive,
    };
  }

  function toggleSet(set: Set<string>, setSet: (next: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  async function onSaveDraft() {
    setError(null);
    setInfo(null);
    if (!subject.trim() || !bodyText.trim()) {
      setError('Subject and body are both required.');
      return;
    }
    startTransition(async () => {
      try {
        const r = await createNewsletterDraft({
          subject,
          bodyText,
          bodyMarkdown,
          filter: currentFilter(),
          scheduledAt: scheduleEnabled && scheduleAt ? new Date(scheduleAt).toISOString() : null,
        });
        router.push(`/newsletters/${r.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  async function onSendTest() {
    setError(null);
    setInfo(null);
    if (!subject.trim() || !bodyText.trim()) {
      setError('Subject and body are both required.');
      return;
    }
    startTransition(async () => {
      try {
        const r = await sendNewsletterTest({
          subject,
          bodyText,
          bodyMarkdown,
          filter: currentFilter(),
        });
        if (r.ok) setInfo(`Test sent — check your inbox. ${r.detail ?? ''}`);
        else setError(`Test failed: ${r.detail ?? 'unknown'}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Test failed');
      }
    });
  }

  async function onSendForReal() {
    setError(null);
    setInfo(null);
    if (!subject.trim() || !bodyText.trim()) {
      setError('Subject and body are both required.');
      return;
    }
    if (!preview || preview.count === 0) {
      setError('No recipients match the current filters.');
      return;
    }
    startTransition(async () => {
      try {
        // Save first so we have a Newsletter row to attribute the
        // send to + log on each Activity.
        const isScheduling = scheduleEnabled && scheduleAt;
        const draft = await createNewsletterDraft({
          subject,
          bodyText,
          bodyMarkdown,
          filter: currentFilter(),
          scheduledAt: isScheduling ? new Date(scheduleAt).toISOString() : null,
        });
        if (isScheduling) {
          setInfo(
            `Scheduled for ${new Date(scheduleAt).toLocaleString()} — ${preview?.count ?? 0} recipient${preview?.count === 1 ? '' : 's'}. The cron tick fires due ones every few minutes.`,
          );
          router.push(`/newsletters/${draft.id}`);
          return;
        }
        const r = await sendNewsletter(draft.id);
        setInfo(
          `Sent to ${r.sentCount} of ${r.recipientCount}. ${r.blockedCount} skipped (no email / unsubscribed), ${r.errorCount} failed.`,
        );
        router.push(`/newsletters/${draft.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Send failed');
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {info}
          </div>
        )}

        <Card title="Email">
          <label className="block">
            <span className="text-[11px] font-medium text-gray-600">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Quick update from Roof Tech"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-600">
                Body {bodyMarkdown ? '(markdown)' : '(plain text)'}
              </span>
              <button
                type="button"
                onClick={() => setBodyMarkdown((v) => !v)}
                className="text-[10.5px] text-primary hover:underline"
              >
                {bodyMarkdown ? 'Switch to plain text' : 'Switch to markdown'}
              </button>
            </div>
            {bodyMarkdown && (
              <div className="mt-1 flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-gray-300 bg-gray-50 px-2 py-1">
                <ToolbarButton
                  title="Bold (wraps **text**)"
                  onClick={() => wrapSelection(bodyRef.current, '**', '**', setBodyText)}
                >
                  <Bold className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  title="Italic (wraps *text*)"
                  onClick={() => wrapSelection(bodyRef.current, '*', '*', setBodyText)}
                >
                  <Italic className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  title="Heading"
                  onClick={() => prefixLines(bodyRef.current, '## ', setBodyText)}
                >
                  <Heading2 className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  title="Bulleted list"
                  onClick={() => prefixLines(bodyRef.current, '- ', setBodyText)}
                >
                  <List className="h-3.5 w-3.5" />
                </ToolbarButton>
                <ToolbarButton
                  title="Insert link"
                  onClick={() => {
                    const url = window.prompt('Link URL (https://…)?');
                    if (!url || !/^https?:\/\//.test(url)) return;
                    wrapSelection(bodyRef.current, '[', `](${url})`, setBodyText);
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </ToolbarButton>
                <span className="ml-auto text-[10.5px] text-gray-500">
                  **bold**, *italic*, ## heading, - list, [link](url)
                </span>
              </div>
            )}
            <textarea
              ref={bodyRef}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={14}
              placeholder={
                bodyMarkdown
                  ? 'Hey team —\n\nA quick update on **what we shipped** this quarter:\n\n- Card scanner\n- Networking groups\n- Lasso radius mode\n\nMore at [our blog](https://example.com).\n\n— Kirk'
                  : 'Hey team —\n\nA quick update on what we’ve been up to this quarter…\n\nReach out anytime.\n— Kirk'
              }
              className={`w-full ${
                bodyMarkdown ? 'rounded-b-md border-t-0' : 'mt-1 rounded-md'
              } border border-gray-300 px-3 py-2 font-mono text-sm leading-relaxed`}
            />
            <p className="mt-1 text-[10.5px] text-gray-400">
              {bodyMarkdown
                ? 'Markdown is rendered to HTML server-side. Only http(s) links are allowed; everything else is escaped to plain text.'
                : 'Paragraph breaks come from blank lines.'}
            </p>
          </div>
        </Card>

        <Card title="Audience">
          <div className="space-y-3">
            <FilterGroup
              label="Partner type"
              options={partnerTypes.map((t) => ({ key: t.key, label: t.label }))}
              picked={pickedTypes}
              onToggle={(k) => toggleSet(pickedTypes, setPickedTypes, k)}
              emptyHint="All types"
            />
            <FilterGroup
              label="Stage"
              options={stages.map((s) => ({ key: s.key, label: s.label }))}
              picked={pickedStages}
              onToggle={(k) => toggleSet(pickedStages, setPickedStages, k)}
              emptyHint="All non-Inactive stages"
            />
            {groups.length > 0 && (
              <FilterGroup
                label="Networking group"
                options={groups.map((g) => ({ key: g.id, label: g.label }))}
                picked={pickedGroups}
                onToggle={(k) => toggleSet(pickedGroups, setPickedGroups, k)}
                emptyHint="All groups"
              />
            )}
            <div className="flex flex-wrap gap-3 pt-2 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeCustomers}
                  onChange={(e) => setIncludeCustomers(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                Include customer-only partners
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                Include Inactive stage
              </label>
            </div>
          </div>
        </Card>
      </div>

      <aside className="space-y-3">
        <Card title="Audience preview">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-gray-900">
              {isPreviewing ? '…' : (preview?.count ?? 0)}
            </span>
            <span className="text-xs text-gray-500">recipients with email</span>
          </div>
          <p className="mt-1 text-[10.5px] text-gray-400">
            Excludes archived partners, anyone without a primary contact email, and anyone
            who&apos;s previously unsubscribed.
          </p>
          {preview && preview.sample.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
                Sample (first 5)
              </div>
              {preview.sample.map((s, idx) => (
                <div key={idx} className="text-[11px] text-gray-700">
                  <span className="font-medium">{s.companyName}</span>{' '}
                  <span className="text-gray-500">· {s.email}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Send">
          <div className="space-y-2">
            <Button onClick={onSendTest} variant="secondary" className="w-full">
              <Eye className="h-4 w-4" /> Send test to me
            </Button>
            <Button onClick={onSaveDraft} variant="secondary" className="w-full">
              <Save className="h-4 w-4" /> Save as draft
            </Button>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <Clock className="h-3.5 w-3.5 text-gray-500" /> Schedule for later
              </label>
              {scheduleEnabled && (
                <>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                  />
                  <p className="mt-1 text-[10.5px] text-gray-500">
                    Cron tick fires due newsletters every few minutes — pick a time at least 5
                    minutes from now.
                  </p>
                </>
              )}
            </div>
            {!confirming ? (
              <Button
                onClick={() => setConfirming(true)}
                disabled={
                  !preview ||
                  preview.count === 0 ||
                  !subject.trim() ||
                  !bodyText.trim() ||
                  (scheduleEnabled && !scheduleAt)
                }
                className="w-full"
              >
                <Send className="h-4 w-4" />{' '}
                {scheduleEnabled
                  ? `Schedule for ${preview?.count ?? 0}`
                  : `Send to ${preview?.count ?? 0}`}
              </Button>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-[11px] text-amber-900">
                    This will send <strong>{preview?.count ?? 0} emails</strong> right now. Once
                    out, you can&apos;t unsend. Confirm to proceed.
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirming(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSendForReal} className="flex-1">
                    <Send className="h-3.5 w-3.5" /> Send now
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-[10.5px] text-gray-400">
            Activity entries are logged on every partner who receives the newsletter. Bounces +
            opens require Resend webhook wiring (v2).
          </p>
        </Card>

        <Card title="Out of scope (v1)">
          <ul className="space-y-1 text-[11px] text-gray-600">
            <li>• Rich-text / HTML editor</li>
            <li>• Scheduled send for a future date</li>
            <li>• Open / click tracking via Resend webhooks</li>
            <li>• A/B subject testing</li>
            <li>• Recurring drip newsletters</li>
          </ul>
          <p className="mt-2 text-[10.5px] text-gray-400">
            All of these are unblocked by this v1 — say the word and we&apos;ll add them.
          </p>
        </Card>
      </aside>
    </div>
  );
}

// ─── Markdown helpers ────────────────────────────────────────────
//
// Wrap the current selection with prefix/suffix. If nothing's
// selected, drops the cursor between them so the rep can keep typing.
function wrapSelection(
  ta: HTMLTextAreaElement | null,
  prefix: string,
  suffix: string,
  setBody: (s: string) => void,
) {
  if (!ta) return;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const before = ta.value.slice(0, start);
  const sel = ta.value.slice(start, end);
  const after = ta.value.slice(end);
  const next = `${before}${prefix}${sel}${suffix}${after}`;
  setBody(next);
  // Restore selection just inside the wrapper for fast iteration.
  window.requestAnimationFrame(() => {
    ta.focus();
    const cursor = start + prefix.length + sel.length;
    ta.setSelectionRange(cursor, cursor);
  });
}

// Prefix every selected line (or just the line under the cursor when
// nothing's selected) with the given marker. Used for headings + lists.
function prefixLines(ta: HTMLTextAreaElement | null, prefix: string, setBody: (s: string) => void) {
  if (!ta) return;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = ta.value.indexOf('\n', end);
  const sliceEnd = lineEnd === -1 ? ta.value.length : lineEnd;
  const before = ta.value.slice(0, lineStart);
  const lines = ta.value.slice(lineStart, sliceEnd).split('\n');
  const prefixed = lines.map((l) => (l.startsWith(prefix) ? l : prefix + l)).join('\n');
  const after = ta.value.slice(sliceEnd);
  setBody(`${before}${prefixed}${after}`);
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1 text-gray-600 hover:bg-white hover:text-primary"
    >
      {children}
    </button>
  );
}

function FilterGroup({
  label,
  options,
  picked,
  onToggle,
  emptyHint,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  picked: Set<string>;
  onToggle: (key: string) => void;
  emptyHint: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-label text-gray-500">
          {label}
        </span>
        {picked.size === 0 && (
          <Pill tone="soft" color="gray">
            {emptyHint}
          </Pill>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = picked.has(o.key);
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onToggle(o.key)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                on
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
