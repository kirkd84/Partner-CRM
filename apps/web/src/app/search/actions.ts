'use server';

import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';

export type SearchHit =
  | {
      kind: 'partner';
      id: string;
      title: string;
      subtitle: string;
      href: string;
      badge?: string;
    }
  | {
      kind: 'contact';
      id: string;
      title: string;
      subtitle: string;
      href: string;
      badge?: string;
    }
  | {
      kind: 'task';
      id: string;
      title: string;
      subtitle: string;
      href: string;
      badge?: string;
    };

/**
 * Global Cmd/K search — partners + contacts + tasks, scoped to the
 * caller's markets. Case-insensitive `contains` match; trims result
 * sets so the palette stays snappy.
 */
export async function globalSearch(q: string): Promise<SearchHit[]> {
  const session = await auth();
  if (!session?.user) return [];
  const term = q.trim();
  if (term.length < 1) return [];

  const marketFilter = { marketId: { in: session.user.markets } };
  const repScopeIfRep =
    session.user.role === 'REP'
      ? { OR: [{ assignedRepId: session.user.id }, { assignedRepId: null }] }
      : {};

  const [partners, contacts, tasks] = await Promise.all([
    prisma.partner.findMany({
      where: {
        ...marketFilter,
        ...repScopeIfRep,
        archivedAt: null,
        OR: [
          { companyName: { contains: term, mode: 'insensitive' } },
          { publicId: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, companyName: true, publicId: true, city: true, state: true },
      take: 8,
    }),
    prisma.contact.findMany({
      where: {
        partner: { ...marketFilter, ...repScopeIfRep, archivedAt: null },
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { title: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        title: true,
        partner: { select: { id: true, companyName: true, publicId: true } },
      },
      take: 8,
    }),
    prisma.task.findMany({
      where: {
        partner: { ...marketFilter, ...repScopeIfRep, archivedAt: null },
        completedAt: null,
        title: { contains: term, mode: 'insensitive' },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        priority: true,
        partner: { select: { id: true, companyName: true, publicId: true } },
      },
      take: 6,
    }),
  ]);

  const hits: SearchHit[] = [
    ...partners.map((p) => ({
      kind: 'partner' as const,
      id: p.id,
      title: p.companyName,
      subtitle: [p.city, p.state].filter(Boolean).join(', ') || '—',
      href: `/partners/${p.id}`,
      badge: p.publicId,
    })),
    ...contacts
      .filter((c) => c.partner) // skip orphaned (shouldn't happen)
      .map((c) => ({
        kind: 'contact' as const,
        id: c.id,
        title: c.name,
        subtitle: `${c.title ? `${c.title} · ` : ''}${c.partner!.companyName}`,
        href: `/partners/${c.partner!.id}`,
        badge: c.partner!.publicId,
      })),
    ...tasks
      .filter((t) => t.partner)
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        subtitle: `${t.partner!.companyName}${
          t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString()}` : ''
        }`,
        href: `/partners/${t.partner!.id}`,
        badge: t.priority !== 'NORMAL' ? t.priority : undefined,
      })),
  ];

  return hits;
}
