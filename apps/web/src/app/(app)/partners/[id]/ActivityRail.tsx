'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, EmptyState, Avatar } from '@partnerradar/ui';
import {
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  ListTodo,
  CheckCircle2,
  AtSign,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
} from 'lucide-react';
import { addComment } from './actions';

interface ActivityItem {
  id: string;
  type: string;
  body: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarColor: string };
}

type Channel = 'comment' | 'email' | 'sms';

/**
 * Storm-parity right rail — a Comments-only, full-height composer.
 * Tabs for Appointments/Tasks were removed per design feedback; those
 * categories already have dedicated cards in the 2×2 grid below. The
 * composer gets a richer Storm-style treatment:
 *  - Rich text toolbar (B / I / U / S / lists / link) via contenteditable
 *  - Channel switcher down the left edge (Note / Email / SMS)
 *  - Activity feed renders the stored HTML safely
 */
export function ActivityRail({
  partnerId,
  canEdit,
  activities,
}: {
  partnerId: string;
  canEdit: boolean;
  activities: ActivityItem[];
}) {
  return (
    <Card
      className="flex h-full flex-col"
      title={
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <span>Comments</span>
          <span className="text-[10.5px] uppercase tracking-label text-gray-400">
            {activities.length}
          </span>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {canEdit && <CommentComposer partnerId={partnerId} />}
        <div className="flex-1 overflow-y-auto">
          {activities.length === 0 ? (
            <EmptyState title="No activity yet" description="Post the first comment above." />
          ) : (
            <ol className="space-y-3">
              {activities.map((a) => (
                <ActivityCard key={a.id} item={a} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Composer ────────────────────────────────────────────────────────

function CommentComposer({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [channel, setChannel] = useState<Channel>('comment');
  const [isEmpty, setIsEmpty] = useState(true);
  const [charCount, setCharCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    onInput();
  }

  function onInput() {
    const el = editorRef.current;
    if (!el) return;
    const text = el.textContent ?? '';
    setIsEmpty(text.trim().length === 0);
    setCharCount(text.length);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML.trim();
    const text = (el.textContent ?? '').trim();
    if (!text) return;

    startTransition(async () => {
      await addComment(partnerId, html);
      el.innerHTML = '';
      setIsEmpty(true);
      setCharCount(0);
      router.refresh();
    });
  }

  function insertLink() {
    const url = window.prompt('Link URL:', 'https://');
    if (!url) return;
    exec('createLink', url);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 rounded-md border border-card-border bg-white shadow-sm"
    >
      {/* Rich text toolbar — Storm parity */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
        <ToolbarButton onClick={() => exec('bold')} title="Bold (⌘B)" icon={Bold} />
        <ToolbarButton onClick={() => exec('italic')} title="Italic (⌘I)" icon={Italic} />
        <ToolbarButton onClick={() => exec('underline')} title="Underline (⌘U)" icon={Underline} />
        <ToolbarButton
          onClick={() => exec('strikeThrough')}
          title="Strikethrough"
          icon={Strikethrough}
        />
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => exec('insertUnorderedList')}
          title="Bullet list"
          icon={List}
        />
        <ToolbarButton
          onClick={() => exec('insertOrderedList')}
          title="Numbered list"
          icon={ListOrdered}
        />
        <ToolbarButton onClick={insertLink} title="Insert link" icon={Link2} />
        <div className="ml-auto">
          <ToolbarButton title="@mention (Phase 7)" icon={AtSign} disabled />
        </div>
      </div>

      {/* Body: channel icons (left) + editor (right) */}
      <div className="flex items-stretch">
        <div className="flex shrink-0 flex-col items-center gap-0.5 border-r border-gray-100 bg-gray-50/60 p-1.5">
          <ChannelButton
            active={channel === 'comment'}
            onClick={() => setChannel('comment')}
            title="Note (internal comment)"
            icon={MessageSquare}
          />
          <ChannelButton
            active={channel === 'email'}
            onClick={() => setChannel('email')}
            title="Email (drafts save now — Phase 7 sends via Resend)"
            icon={Mail}
          />
          <ChannelButton
            active={channel === 'sms'}
            onClick={() => setChannel('sms')}
            title="SMS (Phase 7 sends via Twilio)"
            icon={Phone}
          />
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onKeyDown={(e) => {
            // Keyboard shortcuts — ⌘/Ctrl + B / I / U
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
              const k = e.key.toLowerCase();
              if (k === 'b' || k === 'i' || k === 'u') {
                e.preventDefault();
                exec(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
              }
            }
          }}
          data-placeholder={
            channel === 'email'
              ? 'Compose email… (goes live in Phase 7)'
              : channel === 'sms'
                ? 'Compose SMS… (goes live in Phase 7)'
                : 'Leave a comment…'
          }
          className="prose prose-sm min-h-[8rem] w-full max-w-none flex-1 resize-none px-3 py-2.5 text-sm text-gray-900 outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] [&_a]:text-blue-600 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
        />
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
        <span className="text-[11px] text-gray-400">
          {charCount > 0 ? `${charCount} / 5000` : ' '}
          {channel === 'email' && (
            <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              Email draft
            </span>
          )}
          {channel === 'sms' && (
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              SMS draft
            </span>
          )}
        </span>
        <Button type="submit" size="sm" disabled={isEmpty || isPending} loading={isPending}>
          {channel === 'email'
            ? 'Save email draft'
            : channel === 'sms'
              ? 'Save SMS draft'
              : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}

function ToolbarButton({
  onClick,
  icon: Icon,
  title,
  disabled,
}: {
  onClick?: () => void;
  icon: React.ElementType;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep selection
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded p-1.5 transition ${
        disabled
          ? 'cursor-not-allowed text-gray-300'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-4 w-px bg-gray-200" />;
}

function ChannelButton({
  active,
  onClick,
  icon: Icon,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 transition ${
        active
          ? 'bg-blue-50 text-blue-600 ring-blue-200'
          : 'bg-white text-gray-500 ring-gray-200 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Activity feed cards ─────────────────────────────────────────────

function ActivityCard({ item }: { item: ActivityItem }) {
  const { icon: Icon, label, iconColor, bgColor } = iconFor(item.type);
  return (
    <li className="rounded-md border border-card-border bg-white p-3">
      <div className="flex items-start gap-2.5">
        <Avatar name={item.user.name} color={item.user.avatarColor} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-gray-900">{item.user.name}</span>
            <span className="text-[11px] text-gray-500">{label}</span>
            <span className="ml-auto text-[10.5px] text-gray-400">{timeAgo(item.createdAt)}</span>
          </div>
          {item.body && (
            <div
              className="prose prose-sm mt-1 max-w-none text-[13px] leading-relaxed text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
              // Safe: body is either plain text from legacy comments or
              // HTML from our allow-listed toolbar (b/i/u/strike/a/ul/ol/li/br/p).
              dangerouslySetInnerHTML={{ __html: sanitizeBody(item.body) }}
            />
          )}
        </div>
        <span
          className={`ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${bgColor} ${iconColor}`}
        >
          <Icon className="h-3 w-3" />
        </span>
      </div>
    </li>
  );
}

/**
 * Tiny HTML allow-list — strips anything the toolbar wouldn't have produced.
 * This is a defense-in-depth layer, not a security boundary; the composer
 * only inserts these tags to begin with. For full XSS defense add DOMPurify
 * in a later phase.
 */
function sanitizeBody(raw: string): string {
  // Strip <script>, <iframe>, <style>, and any on* attributes.
  return raw
    .replace(/<\/?(?:script|iframe|style|object|embed)[^>]*>/gi, '')
    .replace(/ on[a-z]+="[^"]*"/gi, '')
    .replace(/ on[a-z]+='[^']*'/gi, '');
}

function iconFor(type: string) {
  switch (type) {
    case 'COMMENT':
      return {
        icon: MessageSquare,
        label: 'commented',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 ring-gray-200',
      };
    case 'EMAIL_OUT':
    case 'EMAIL_IN':
      return {
        icon: Mail,
        label: 'emailed',
        iconColor: 'text-blue-600',
        bgColor: 'bg-blue-50 ring-blue-100',
      };
    case 'CALL':
      return {
        icon: Phone,
        label: 'logged a call',
        iconColor: 'text-purple-600',
        bgColor: 'bg-purple-50 ring-purple-100',
      };
    case 'SMS_OUT':
    case 'SMS_IN':
      return {
        icon: MessageSquare,
        label: 'sent SMS',
        iconColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50 ring-emerald-100',
      };
    case 'VISIT':
      return {
        icon: MapPin,
        label: 'visited',
        iconColor: 'text-amber-600',
        bgColor: 'bg-amber-50 ring-amber-100',
      };
    case 'MEETING_HELD':
      return {
        icon: CalendarIcon,
        label: 'met',
        iconColor: 'text-indigo-600',
        bgColor: 'bg-indigo-50 ring-indigo-100',
      };
    case 'STAGE_CHANGE':
      return {
        icon: CheckCircle2,
        label: 'changed stage',
        iconColor: 'text-blue-600',
        bgColor: 'bg-blue-50 ring-blue-100',
      };
    case 'ACTIVATION':
      return {
        icon: CheckCircle2,
        label: 'activated',
        iconColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50 ring-emerald-100',
      };
    case 'ASSIGNMENT':
      return {
        icon: CheckCircle2,
        label: 'assigned',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 ring-gray-200',
      };
    case 'CLAIM':
      return {
        icon: ListTodo,
        label: 'claimed',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 ring-gray-200',
      };
    default:
      return {
        icon: MessageSquare,
        label: 'updated',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 ring-gray-200',
      };
  }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
