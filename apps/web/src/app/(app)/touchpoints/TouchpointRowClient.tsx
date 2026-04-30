'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Cake, Briefcase, Handshake, Send, Edit2, X, Eye } from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import {
  updateTouchpoint,
  cancelTouchpoint,
  sendTouchpointNow,
  getTouchpointPreview,
} from './actions';

interface Props {
  id: string;
  kind: 'BIRTHDAY' | 'BUSINESS_ANNIVERSARY' | 'PARTNERSHIP_MILESTONE';
  kindLabel: string;
  partner: { id: string; companyName: string };
  meta: Record<string, unknown>;
  message: string | null;
  channel: 'SMS' | 'EMAIL' | 'MANUAL';
  scheduledFor: string;
}

const ICONS = {
  BIRTHDAY: <Cake className="h-3.5 w-3.5 text-pink-500" />,
  BUSINESS_ANNIVERSARY: <Briefcase className="h-3.5 w-3.5 text-amber-500" />,
  PARTNERSHIP_MILESTONE: <Handshake className="h-3.5 w-3.5 text-blue-500" />,
};

interface PreviewState {
  subject: string;
  body: string;
  channel: 'SMS' | 'EMAIL' | 'MANUAL';
  recipient: string | null;
  blockers: string[];
}

export function TouchpointRowClient(props: Props) {
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState(props.channel);
  const [message, setMessage] = useState(props.message ?? '');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [, start] = useTransition();

  function save() {
    start(async () => {
      await updateTouchpoint(props.id, { channel, message });
      setEditing(false);
    });
  }
  function cancel() {
    start(async () => {
      await cancelTouchpoint(props.id);
    });
  }
  function openPreview() {
    setFeedback(null);
    start(async () => {
      const r = await getTouchpointPreview(props.id);
      if (!r) {
        setFeedback('Could not load preview');
        return;
      }
      setPreview(r);
    });
  }
  function confirmSend() {
    start(async () => {
      // If the rep tweaked the body in the preview, persist it before
      // sending so the actual send pulls the customized text.
      if (preview && preview.body !== (message || props.message || '')) {
        await updateTouchpoint(props.id, { channel: preview.channel, message: preview.body });
      }
      const r = await sendTouchpointNow(props.id);
      setFeedback(r.outcome === 'SENT' ? 'Sent' : `Failed: ${r.detail ?? ''}`);
      setPreview(null);
    });
  }

  const personLine =
    props.kind === 'BIRTHDAY' && typeof props.meta.contactName === 'string'
      ? props.meta.contactName
      : props.kind === 'PARTNERSHIP_MILESTONE' && typeof props.meta.years === 'number'
        ? `${props.meta.years}-year partnership`
        : props.kindLabel;

  return (
    <li className="py-2">
      <div className="flex items-center gap-2 text-sm">
        {ICONS[props.kind]}
        <Link
          href={`/partners/${props.partner.id}`}
          className="font-medium text-gray-900 hover:text-primary"
        >
          {props.partner.companyName}
        </Link>
        <span className="text-gray-500">· {personLine}</span>
        <Pill
          tone="soft"
          color={channel === 'SMS' ? 'emerald' : channel === 'EMAIL' ? 'blue' : 'gray'}
        >
          {channel.toLowerCase()}
        </Pill>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-primary"
            aria-label="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={openPreview}
            disabled={channel === 'MANUAL'}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            title={channel === 'MANUAL' ? 'Switch to SMS or Email to send' : 'Preview + send'}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Cancel"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-gray-600">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Props['channel'])}
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs"
            >
              <option value="SMS">SMS</option>
              <option value="EMAIL">Email</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Customize the message — leave blank for the default."
            className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {preview && (
        <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs">
          <div className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-label text-blue-700">
            Preview
            <Pill tone="soft" color={preview.channel === 'SMS' ? 'emerald' : 'blue'}>
              {preview.channel.toLowerCase()}
            </Pill>
            {preview.recipient && (
              <span className="font-mono text-[11px] font-normal text-blue-900">
                → {preview.recipient}
              </span>
            )}
          </div>
          {preview.channel === 'EMAIL' && (
            <div className="mb-1">
              <span className="text-[10.5px] uppercase tracking-label text-gray-500">Subject</span>
              <input
                value={preview.subject}
                onChange={(e) => setPreview({ ...preview, subject: e.target.value })}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              />
            </div>
          )}
          <span className="text-[10.5px] uppercase tracking-label text-gray-500">Message</span>
          <textarea
            rows={4}
            value={preview.body}
            onChange={(e) => setPreview({ ...preview, body: e.target.value })}
            className="mt-0.5 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
          {preview.blockers.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-red-700">
              {preview.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSend}
              disabled={preview.blockers.length > 0}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3 w-3" /> Send now
            </button>
          </div>
        </div>
      )}
      {feedback && <div className="mt-1 text-[11px] text-gray-500">{feedback}</div>}
    </li>
  );
}
