'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, DrawerModal } from '@partnerradar/ui';
import { UserPlus, Copy, Check } from 'lucide-react';
import type { Role } from '@partnerradar/types';
import { inviteUser } from './actions';

interface Market {
  id: string;
  name: string;
}

export function UsersToolbar({
  markets,
  canCreateAdmin,
}: {
  markets: Market[];
  canCreateAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('REP');
  const [selected, setSelected] = useState<string[]>(markets[0] ? [markets[0].id] : []);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleMarket(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !name.trim() || selected.length === 0) return;
    startTransition(async () => {
      try {
        const res = await inviteUser({ email, name, role, marketIds: selected });
        setTempPassword(res.tempPassword);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invite failed');
      }
    });
  }

  function onCopy() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function onClose() {
    setOpen(false);
    // reset once drawer is closed
    window.setTimeout(() => {
      setEmail('');
      setName('');
      setRole('REP');
      setSelected(markets[0] ? [markets[0].id] : []);
      setTempPassword(null);
      setError(null);
    }, 200);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Invite user
      </Button>

      <DrawerModal
        open={open}
        onClose={onClose}
        title={tempPassword ? 'User invited' : 'Invite user'}
        footer={
          tempPassword ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={onSubmit}
                loading={isPending}
                disabled={!email.trim() || !name.trim() || selected.length === 0}
              >
                Send invite
              </Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Share this temporary password with the invitee — they'll be prompted to change it on
              first login.
            </p>
            <div className="rounded-md border border-card-border bg-gray-50 p-3 font-mono text-sm">
              {tempPassword}
            </div>
            <Button variant="secondary" onClick={onCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy password
                </>
              )}
            </Button>
            <p className="text-[11px] text-gray-400">
              Email-driven magic-link invitations arrive when Resend credentials are wired.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Role" required>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="REP">Rep</option>
                <option value="MANAGER">Manager</option>
                {canCreateAdmin && <option value="ADMIN">Admin</option>}
              </select>
            </Field>
            <Field label="Markets" required>
              <div className="space-y-1.5 rounded-md border border-gray-200 p-2.5">
                {markets.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={() => toggleMarket(m.id)}
                      className="rounded"
                    />
                    {m.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                First selection becomes their primary market.
              </p>
            </Field>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </form>
        )}
      </DrawerModal>
    </>
  );
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
