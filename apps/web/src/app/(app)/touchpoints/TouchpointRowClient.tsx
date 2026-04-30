'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Cake, Briefcase, Handshake, Send, Edit2, X } from 'lucide-react';
import { Pill } from '@partnerradar/ui';
import { updateTouchpoint, cancelTouchpoint, sendTouchpointNow } from './actions';

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

export function TouchpointRowClient(props: Props) {
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState(props.channel);
  const [message, setMessage] = useState(props.message ?? '');
  const [feedback, setFeedback] = useState<string | null>(null);
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
  function send() {
    start(async () => {
      const r = await sendTouchpointNow(props.id);
      setFeedback(r.outcome === 'SENT' ? 'Sent' : `Failed: ${r.detail ?? ''}`);
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
            onClick={send}
            disabled={channel === 'MANUAL'}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            title={channel === 'MANUAL' ? 'Switch to SMS or Email to send' : 'Send now'}
          >
            <Send className="h-3 w-3" /> Send
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
      {feedback && <div className="mt-1 text-[11px] text-gray-500">{feedback}</div>}
    </li>
  );
}
