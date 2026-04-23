'use client';
import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DrawerModal, Button } from '@partnerradar/ui';
import { MoreVertical, KeyRound, Trash2, Pencil } from 'lucide-react';
import type { Role } from '@partnerradar/types';
import { setUserActive, setUserRole, setUserMarkets, deleteUser, resetPassword } from './actions';

interface Market {
  id: string;
  name: string;
}

export function UserRowActions({
  userId,
  name,
  role,
  active,
  markets,
  allMarkets,
  isAdmin,
}: {
  userId: string;
  name: string;
  role: Role;
  active: boolean;
  markets: string[];
  allMarkets: Market[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<{ tempPassword: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const [editRole, setEditRole] = useState<Role>(role);
  const [editMarkets, setEditMarkets] = useState<string[]>(markets);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  function onToggleActive() {
    setMenuOpen(false);
    startTransition(async () => {
      try {
        await setUserActive(userId, !active);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onResetPassword() {
    setMenuOpen(false);
    startTransition(async () => {
      try {
        const res = await resetPassword(userId);
        setResetOpen({ tempPassword: res.tempPassword });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onDelete() {
    setMenuOpen(false);
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteUser(userId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  function onSaveEdit() {
    const promises: Promise<unknown>[] = [];
    if (isAdmin && editRole !== role) promises.push(setUserRole(userId, editRole));
    const marketsChanged =
      editMarkets.length !== markets.length || editMarkets.some((m) => !markets.includes(m));
    if (marketsChanged) promises.push(setUserMarkets(userId, editMarkets));

    if (promises.length === 0) {
      setEditOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await Promise.all(promises);
        setEditOpen(false);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  function toggleMarket(id: string) {
    setEditMarkets((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  return (
    <>
      <div ref={menuRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={isPending}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            <MenuItem
              icon={Pencil}
              onClick={() => {
                setMenuOpen(false);
                setEditMarkets(markets);
                setEditRole(role);
                setEditOpen(true);
              }}
            >
              Edit role + markets
            </MenuItem>
            <MenuItem icon={KeyRound} onClick={onResetPassword}>
              Reset password
            </MenuItem>
            <MenuItem icon={active ? Trash2 : Pencil} onClick={onToggleActive}>
              {active ? 'Deactivate' : 'Reactivate'}
            </MenuItem>
            {isAdmin && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <MenuItem icon={Trash2} danger onClick={onDelete}>
                  Delete permanently
                </MenuItem>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit role + markets drawer */}
      <DrawerModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveEdit} loading={isPending} disabled={editMarkets.length === 0}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {isAdmin && (
            <label className="block">
              <span className="text-[11px] font-medium text-gray-600">Role</span>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as Role)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="REP">Rep</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[11px] font-medium text-gray-600">Markets</span>
            <div className="mt-1 space-y-1.5 rounded-md border border-gray-200 p-2.5">
              {allMarkets.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editMarkets.includes(m.id)}
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
          </label>
        </div>
      </DrawerModal>

      {/* Reset-password reveal drawer */}
      <DrawerModal
        open={resetOpen !== null}
        onClose={() => setResetOpen(null)}
        title="Password reset"
        footer={<Button onClick={() => setResetOpen(null)}>Done</Button>}
      >
        {resetOpen && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              New temporary password for <strong>{name}</strong>. They'll be prompted to change it
              on next login.
            </p>
            <div className="rounded-md border border-card-border bg-gray-50 p-3 font-mono text-sm">
              {resetOpen.tempPassword}
            </div>
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(resetOpen.tempPassword)}
            >
              Copy
            </Button>
          </div>
        )}
      </DrawerModal>
    </>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
