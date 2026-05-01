'use client';

import { useState, useTransition } from 'react';
import { Card } from '@partnerradar/ui';
import { Save, Cake, Briefcase, Handshake } from 'lucide-react';
import { setMilestoneYears, setTouchpointTemplates } from './actions';

const DEFAULTS = {
  BIRTHDAY: {
    subject: 'Happy birthday, {{firstName}}!',
    body: 'Happy birthday, {{firstName}}! Hope you have a great day. — {{sender}}',
  },
  BUSINESS_ANNIVERSARY: {
    subject: 'Happy anniversary, {{companyName}}!',
    body: 'Congrats on another year of {{companyName}}! 🎉 — {{sender}}',
  },
  PARTNERSHIP_MILESTONE: {
    subject: '{{years}} of partnership 🎉',
    body: 'Today marks {{years}} of working together with {{companyName}}. Thanks for being a great partner! — {{sender}}',
  },
};

const KIND_META = {
  BIRTHDAY: { icon: Cake, color: 'text-pink-500', label: 'Birthday' },
  BUSINESS_ANNIVERSARY: { icon: Briefcase, color: 'text-amber-500', label: 'Business anniversary' },
  PARTNERSHIP_MILESTONE: {
    icon: Handshake,
    color: 'text-blue-500',
    label: 'Partnership milestone',
  },
} as const;

export function TenantConfigClient({
  milestoneYears,
  templates,
}: {
  milestoneYears: number[];
  templates: Record<string, { subject: string; body: string }> | null;
}) {
  const [years, setYears] = useState(
    milestoneYears.length > 0 ? milestoneYears.join(', ') : '1, 2, 3, 5, 7, 10, 15, 20, 25, 30',
  );
  const [tpls, setTpls] = useState(() => ({
    BIRTHDAY: templates?.BIRTHDAY ?? { subject: '', body: '' },
    BUSINESS_ANNIVERSARY: templates?.BUSINESS_ANNIVERSARY ?? { subject: '', body: '' },
    PARTNERSHIP_MILESTONE: templates?.PARTNERSHIP_MILESTONE ?? { subject: '', body: '' },
  }));
  const [, start] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setSavedAt(msg);
    setTimeout(() => setSavedAt(null), 1800);
  }

  function saveYears() {
    setError(null);
    const parsed = years
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    start(async () => {
      try {
        await setMilestoneYears(parsed);
        flash('Milestone years saved.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  function saveTemplates() {
    setError(null);
    start(async () => {
      try {
        await setTouchpointTemplates(tpls);
        flash('Templates saved.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  function clearTemplates() {
    if (!confirm('Reset every touchpoint template to the built-in defaults?')) return;
    start(async () => {
      try {
        await setTouchpointTemplates(null);
        setTpls({
          BIRTHDAY: { subject: '', body: '' },
          BUSINESS_ANNIVERSARY: { subject: '', body: '' },
          PARTNERSHIP_MILESTONE: { subject: '', body: '' },
        });
        flash('Reset to defaults.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reset failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {savedAt && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {savedAt}
        </div>
      )}

      <Card title="Partnership milestone years">
        <p className="text-[11px] text-gray-500">
          Comma-separated list of years to celebrate as partnership anniversaries (e.g. 1, 2, 5,
          10). Leave empty to use the defaults (1, 2, 3, 5, 7, 10, 15, 20, 25, 30).
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm"
          />
          <button
            type="button"
            onClick={saveYears}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
          >
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </Card>

      <Card title="Touchpoint message templates">
        <p className="text-[11px] text-gray-500">
          Customize the default congrats message for each kind. Tokens:{' '}
          <code className="rounded bg-gray-100 px-1">{`{{firstName}}`}</code>,{' '}
          <code className="rounded bg-gray-100 px-1">{`{{contactName}}`}</code>,{' '}
          <code className="rounded bg-gray-100 px-1">{`{{companyName}}`}</code>,{' '}
          <code className="rounded bg-gray-100 px-1">{`{{years}}`}</code>,{' '}
          <code className="rounded bg-gray-100 px-1">{`{{sender}}`}</code>,{' '}
          <code className="rounded bg-gray-100 px-1">{`{{tenantName}}`}</code>. Leave a kind blank
          to fall back to the built-in default.
        </p>
        <div className="mt-3 space-y-4">
          {(['BIRTHDAY', 'BUSINESS_ANNIVERSARY', 'PARTNERSHIP_MILESTONE'] as const).map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const placeholder = DEFAULTS[kind];
            return (
              <div key={kind} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-label text-gray-500">
                  <Icon className={`h-3 w-3 ${meta.color}`} />
                  {meta.label}
                </div>
                <input
                  value={tpls[kind].subject}
                  onChange={(e) =>
                    setTpls((prev) => ({
                      ...prev,
                      [kind]: { ...prev[kind], subject: e.target.value },
                    }))
                  }
                  placeholder={placeholder.subject}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <textarea
                  rows={3}
                  value={tpls[kind].body}
                  onChange={(e) =>
                    setTpls((prev) => ({
                      ...prev,
                      [kind]: { ...prev[kind], body: e.target.value },
                    }))
                  }
                  placeholder={placeholder.body}
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 font-sans text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={saveTemplates}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
          >
            <Save className="h-3 w-3" /> Save templates
          </button>
          <button
            type="button"
            onClick={clearTemplates}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Reset all to defaults
          </button>
        </div>
      </Card>
    </div>
  );
}
