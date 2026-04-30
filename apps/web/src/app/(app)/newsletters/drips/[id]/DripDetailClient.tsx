'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Play, Pause, UserPlus, Send } from 'lucide-react';
import { Card } from '@partnerradar/ui';
import { addStep, removeStep, setDripActive, enrollMatching, testSendDripStep } from '../actions';

interface Step {
  id: string;
  position: number;
  delayDays: number;
  subject: string;
  bodyText: string;
}

export function DripDetailClient({
  id,
  active,
  steps: initialSteps,
}: {
  id: string;
  active: boolean;
  steps: Step[];
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [isActive, setIsActive] = useState(active);
  const [adding, setAdding] = useState(false);
  const [delayDays, setDelayDays] = useState(7);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [, start] = useTransition();

  function add() {
    setFeedback(null);
    start(async () => {
      const r = await addStep({ dripId: id, delayDays, subject, bodyText: body });
      setSteps((prev) => [
        ...prev,
        { id: r.id, position: prev.length, delayDays, subject, bodyText: body },
      ]);
      setSubject('');
      setBody('');
      setDelayDays(7);
      setAdding(false);
    });
  }

  function del(stepId: string) {
    start(async () => {
      await removeStep(stepId);
      setSteps((prev) =>
        prev.filter((s) => s.id !== stepId).map((s, idx) => ({ ...s, position: idx })),
      );
    });
  }

  function testSend(stepId: string) {
    setFeedback(null);
    start(async () => {
      try {
        const r = await testSendDripStep(stepId);
        setFeedback(r.ok ? 'Test email sent to your inbox.' : `Test failed: ${r.detail ?? ''}`);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : 'Test failed');
      }
    });
  }

  function toggle() {
    start(async () => {
      await setDripActive(id, !isActive);
      setIsActive(!isActive);
    });
  }

  function enroll() {
    setFeedback(null);
    start(async () => {
      try {
        const r = await enrollMatching(id);
        setFeedback(
          `Enrolled ${r.enrolled}; already enrolled ${r.alreadyEnrolled}; skipped ${r.skippedNoEmail} with no email.`,
        );
        router.refresh();
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {isActive ? 'Pause drip' : 'Resume drip'}
        </button>
        <button
          type="button"
          onClick={enroll}
          disabled={steps.length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="h-3 w-3" /> Enroll matching partners
        </button>
        {feedback && <span className="text-[11px] text-gray-500">{feedback}</span>}
      </div>

      <Card title={`Steps (${steps.length})`}>
        {steps.length === 0 ? (
          <p className="text-xs text-gray-500">No steps yet — add the first one below.</p>
        ) : (
          <ol className="space-y-2">
            {steps.map((s, idx) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-md border border-gray-200 bg-white p-2"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{s.subject}</div>
                  <div className="text-[11px] text-gray-500">
                    {idx === 0
                      ? `Sends ${s.delayDays} day${s.delayDays === 1 ? '' : 's'} after enrollment`
                      : `Sends ${s.delayDays} day${s.delayDays === 1 ? '' : 's'} after the previous step`}
                  </div>
                  <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] text-gray-700">
                    {s.bodyText.slice(0, 280)}
                    {s.bodyText.length > 280 ? '…' : ''}
                  </pre>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => testSend(s.id)}
                    className="rounded p-1 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                    aria-label="Test send to me"
                    title="Test send this step to my email"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => del(s.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add step
        </button>
      ) : (
        <Card title="New step">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-700">
                Days after {steps.length === 0 ? 'enrollment' : 'previous step'}
              </label>
              <input
                type="number"
                min={0}
                value={delayDays}
                onChange={(e) => setDelayDays(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. How's your first week going?"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-700">
                Body (markdown supported)
              </label>
              <textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{partnerName}}, ..."
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 font-sans text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={add}
                disabled={!subject.trim() || !body.trim()}
                className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add step
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
