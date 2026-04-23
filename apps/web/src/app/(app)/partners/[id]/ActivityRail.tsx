'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, EmptyState, Avatar, Pill } from '@partnerradar/ui';
import {
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  ListTodo,
  CheckCircle2,
  AtSign,
} from 'lucide-react';
import { addComment } from './actions';

interface ActivityItem {
  id: string;
  type: string;
  body: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarColor: string };
}
interface AppointmentItem {
  id: string;
  type: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}
interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  completedAt: string | null;
}

type Tab = 'comments' | 'appointments' | 'tasks';

/**
 * Storm-parity right rail — tabbed Comments / Appointments / Tasks with
 * a bigger footprint than Phase 2's original compact rail. Comments
 * tab includes a rich composer (Note / Email / SMS switcher stubs) and
 * renders the activity feed with type-aware cards.
 */
export function ActivityRail({
  partnerId,
  canEdit,
  activities,
  appointments,
  tasks,
  openTaskCount,
  upcomingAppointmentCount,
}: {
  partnerId: string;
  canEdit: boolean;
  activities: ActivityItem[];
  appointments: AppointmentItem[];
  tasks: TaskItem[];
  openTaskCount: number;
  upcomingAppointmentCount: number;
}) {
  const [tab, setTab] = useState<Tab>('comments');

  return (
    <Card
      title={
        <div className="-mb-1 flex items-center gap-1">
          <TabButton
            active={tab === 'comments'}
            onClick={() => setTab('comments')}
            icon={MessageSquare}
            label="Comments"
            badge={activities.length}
          />
          <TabButton
            active={tab === 'appointments'}
            onClick={() => setTab('appointments')}
            icon={CalendarIcon}
            label="Appointments"
            badge={upcomingAppointmentCount}
          />
          <TabButton
            active={tab === 'tasks'}
            onClick={() => setTab('tasks')}
            icon={ListTodo}
            label="Tasks"
            badge={openTaskCount}
          />
        </div>
      }
    >
      <div className="flex h-full flex-col">
        {tab === 'comments' && (
          <CommentsTab partnerId={partnerId} canEdit={canEdit} activities={activities} />
        )}
        {tab === 'appointments' && <AppointmentsTab appointments={appointments} />}
        {tab === 'tasks' && <TasksTab tasks={tasks} />}
      </div>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Comments tab ────────────────────────────────────────────────────

function CommentsTab({
  partnerId,
  canEdit,
  activities,
}: {
  partnerId: string;
  canEdit: boolean;
  activities: ActivityItem[];
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [channel, setChannel] = useState<'comment' | 'email' | 'sms'>('comment');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    const body = value;
    setValue('');
    startTransition(async () => {
      await addComment(partnerId, body);
      router.refresh();
    });
  }

  return (
    <>
      {canEdit && (
        <form
          onSubmit={onSubmit}
          className="mb-4 rounded-md border border-card-border bg-white shadow-sm"
        >
          {/* Channel strip — Storm-style */}
          <div className="flex items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
            <ChannelButton
              active={channel === 'comment'}
              onClick={() => setChannel('comment')}
              icon={MessageSquare}
              label="Comment"
            />
            <ChannelButton
              active={channel === 'email'}
              onClick={() => setChannel('email')}
              icon={Mail}
              label="Email (Phase 7)"
              disabled
            />
            <ChannelButton
              active={channel === 'sms'}
              onClick={() => setChannel('sms')}
              icon={Phone}
              label="SMS (Phase 7)"
              disabled
            />
            <div className="ml-auto flex items-center gap-0.5">
              <ToolbarIcon label="@mention (Phase 7)" icon={AtSign} disabled />
            </div>
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Leave a comment… @mentions arrive in Phase 7"
            rows={4}
            className="w-full resize-none border-0 px-3 py-2.5 text-sm focus:outline-none focus:ring-0"
          />
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
            <span className="text-[11px] text-gray-400">
              {value.trim() ? `${value.trim().length} / 5000` : ' '}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!value.trim() || isPending}
              loading={isPending}
            >
              Post comment
            </Button>
          </div>
        </form>
      )}

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
    </>
  );
}

function ChannelButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick?: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded p-1.5 transition ${
        active
          ? 'bg-blue-50 text-blue-600'
          : disabled
            ? 'cursor-not-allowed text-gray-300'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ToolbarIcon({
  icon: Icon,
  label,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      className={`rounded p-1.5 ${
        disabled ? 'cursor-not-allowed text-gray-300' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

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
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
              {item.body}
            </p>
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
    default:
      return {
        icon: MessageSquare,
        label: 'updated',
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 ring-gray-200',
      };
  }
}

// ─── Appointments tab ────────────────────────────────────────────────

function AppointmentsTab({ appointments }: { appointments: AppointmentItem[] }) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        title="No appointments yet"
        description="Use the Appointments card below to schedule one."
      />
    );
  }
  const now = Date.now();
  const upcoming = appointments.filter((a) => new Date(a.startsAt).getTime() >= now);
  const past = appointments.filter((a) => new Date(a.startsAt).getTime() < now);

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <Section label="Upcoming">
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} item={a} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section label="Past">
          {past.map((a) => (
            <AppointmentCard key={a.id} item={a} dim />
          ))}
        </Section>
      )}
    </div>
  );
}

function AppointmentCard({ item, dim }: { item: AppointmentItem; dim?: boolean }) {
  return (
    <div className={`rounded-md border border-card-border bg-white p-3 ${dim ? 'opacity-75' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
          <CalendarIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-gray-900">{item.title}</span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-label text-blue-700">
              {item.type}
            </span>
          </div>
          <div className="text-[11px] text-gray-600">
            {new Date(item.startsAt).toLocaleString()} –{' '}
            {new Date(item.endsAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
          {item.location && (
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <MapPin className="h-3 w-3" />
              {item.location}
            </div>
          )}
          {item.notes && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] text-gray-500">{item.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tasks tab ───────────────────────────────────────────────────────

function TasksTab({ tasks }: { tasks: TaskItem[] }) {
  if (tasks.length === 0) {
    return <EmptyState title="No tasks" description="Use the Tasks card below to create one." />;
  }
  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <Section label="Open">
          {open.map((t) => (
            <TaskCard key={t.id} item={t} />
          ))}
        </Section>
      )}
      {done.length > 0 && (
        <Section label="Completed">
          {done.map((t) => (
            <TaskCard key={t.id} item={t} done />
          ))}
        </Section>
      )}
    </div>
  );
}

function TaskCard({ item, done }: { item: TaskItem; done?: boolean }) {
  const overdue = !done && item.dueAt && new Date(item.dueAt).getTime() < Date.now();
  return (
    <div
      className={`rounded-md border border-card-border bg-white p-3 ${done ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${
            done
              ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
              : overdue
                ? 'bg-red-50 text-red-600 ring-red-100'
                : 'bg-amber-50 text-amber-600 ring-amber-100'
          }`}
        >
          <ListTodo className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-[13px] font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}
            >
              {item.title}
            </span>
            {item.priority === 'HIGH' && (
              <Pill color="#f59e0b" tone="soft">
                High
              </Pill>
            )}
            {item.priority === 'URGENT' && (
              <Pill color="#ef4444" tone="soft">
                Urgent
              </Pill>
            )}
          </div>
          {item.dueAt && (
            <div className={`text-[11px] ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
              Due {new Date(item.dueAt).toLocaleDateString()}
              {overdue && ' · overdue'}
            </div>
          )}
          {item.description && <p className="mt-1 text-[11px] text-gray-500">{item.description}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-label text-gray-500">
        {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
