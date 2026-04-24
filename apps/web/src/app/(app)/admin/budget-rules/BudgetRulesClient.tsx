'use client';

/**
 * Client island for /admin/budget-rules.
 *
 * The drawer handles both create AND edit (initial prop switches the mode).
 * Rules live in a 4-tier hierarchy, most specific wins when the approval
 * engine looks one up:
 *   1. (repId, marketId)  — this rep, this market
 *   2. (repId, null)      — this rep, any market
 *   3. (null, marketId)   — any rep, this market
 *   4. (null, null)       — tenant default (always present, can't be deleted)
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createBudgetRule,
  updateBudgetRule,
  deleteBudgetRule,
  type BudgetRuleInput,
} from './actions';

interface Market {
  id: string;
  name: string;
}
interface Rep {
  id: string;
  name: string;
  role: string;
}
interface ExistingRule {
  id: string;
  marketId: string | null;
  repId: string | null;
  autoApproveUnder: number;
  managerApproveUnder: number;
  monthlyBudgetPercentOfRevenue: number | null;
}

type FormState = BudgetRuleInput;

const DEFAULT_FORM: FormState = {
  marketId: null,
  repId: null,
  autoApproveUnder: 25,
  managerApproveUnder: 100,
  monthlyBudgetPercentOfRevenue: 0.05,
};

export function NewRuleButton({ markets, reps }: { markets: Market[]; reps: Rep[] }) {
  return <RuleDrawer markets={markets} reps={reps} triggerStyle="primary" />;
}

export function RuleRowActions({
  rule,
  markets,
  reps,
}: {
  rule: ExistingRule;
  markets: Market[];
  reps: Rep[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isDefault = !rule.marketId && !rule.repId;

  function onDelete() {
    if (isDefault) return;
    if (!confirm('Delete this override? The next-most-specific rule will take over.')) return;
    startTransition(async () => {
      try {
        await deleteBudgetRule(rule.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <RuleDrawer initial={rule} markets={markets} reps={reps} triggerStyle="ghost" />
      {!isDefault && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          title="Delete this override"
          className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function RuleDrawer({
  initial,
  markets,
  reps,
  triggerStyle = 'primary',
}: {
  initial?: ExistingRule;
  markets: Market[];
  reps: Rep[];
  triggerStyle?: 'primary' | 'ghost';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialFormFor(initial));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(initial);
  const isDefault = isEdit && !initial?.marketId && !initial?.repId;

  function onOpen() {
    setForm(initialFormFor(initial));
    setError(null);
    setOpen(true);
  }

  function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && initial) {
          await updateBudgetRule(initial.id, form);
        } else {
          await createBudgetRule(form);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  return (
    <>
      {triggerStyle === 'ghost' ? (
        <button
          type="button"
          onClick={onOpen}
          title="Edit rule"
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={onOpen}>
          <Plus className="h-4 w-4" /> New rule
        </Button>
      )}

      <DrawerModal
        open={open}
        onClose={() => setOpen(false)}
        title={
          isEdit ? (isDefault ? 'Edit tenant default' : 'Edit budget rule') : 'New budget rule'
        }
        width="520px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => onSubmit()} loading={isPending}>
              {isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Market">
            <select
              value={form.marketId ?? ''}
              disabled={isDefault}
              onChange={(e) => setForm({ ...form, marketId: e.target.value || null })}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">All markets</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">
              Leave blank to apply across every market.
            </p>
          </Field>

          <Field label="Rep">
            <select
              value={form.repId ?? ''}
              disabled={isDefault}
              onChange={(e) => setForm({ ...form, repId: e.target.value || null })}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">All reps</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.role}
                </option>
              ))}
            </select>
            {isDefault ? (
              <p className="mt-1 text-[11px] text-gray-500">
                The tenant-wide default can't be reassigned — it's the backstop everyone falls back
                to.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-gray-400">
                Leave blank to apply across every rep.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Auto-approve under ($)" required>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.autoApproveUnder}
                onChange={(e) =>
                  setForm({ ...form, autoApproveUnder: Number(e.target.value) || 0 })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[11px] text-gray-400">No review needed below this.</p>
            </Field>

            <Field label="Manager-approve under ($)" required>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.managerApproveUnder}
                onChange={(e) =>
                  setForm({ ...form, managerApproveUnder: Number(e.target.value) || 0 })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[11px] text-gray-400">Over this goes to admin.</p>
            </Field>
          </div>

          <Field label="Monthly cap (optional)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={
                  form.monthlyBudgetPercentOfRevenue === null
                    ? ''
                    : (form.monthlyBudgetPercentOfRevenue * 100).toFixed(1)
                }
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setForm({
                    ...form,
                    monthlyBudgetPercentOfRevenue: v === '' ? null : Number(v) / 100,
                  });
                }}
                placeholder="e.g. 5"
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-gray-500">% of last month's revenue</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Leave blank for no cap. New expenses are blocked (not queued) once the running total
              exceeds the cap.
            </p>
          </Field>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>
      </DrawerModal>
    </>
  );
}

function initialFormFor(initial?: ExistingRule): FormState {
  if (!initial) return DEFAULT_FORM;
  return {
    marketId: initial.marketId,
    repId: initial.repId,
    autoApproveUnder: initial.autoApproveUnder,
    managerApproveUnder: initial.managerApproveUnder,
    monthlyBudgetPercentOfRevenue: initial.monthlyBudgetPercentOfRevenue,
  };
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
