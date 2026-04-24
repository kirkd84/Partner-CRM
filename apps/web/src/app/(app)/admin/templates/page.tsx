/**
 * /admin/templates — tenant-wide email + SMS templates.
 *
 * Reps pick these when composing a message to a partner contact or
 * inside a cadence. The template body uses {{token}} placeholders that
 * get expanded at send-time by packages/api/src/…/substitute (mirrored
 * here in ./substitute.ts for the editor preview).
 */

import { prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Table, THead, TBody, TR, TH, TD, Pill } from '@partnerradar/ui';
import { Mail, MessageSquare } from 'lucide-react';
import { NewTemplateButton, TemplateRowActions } from './TemplatesClient';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'MANAGER' && session.user.role !== 'ADMIN') redirect('/radar');

  type Row = {
    id: string;
    kind: 'EMAIL' | 'SMS';
    name: string;
    subject: string | null;
    body: string;
    stage:
      | 'NEW_LEAD'
      | 'RESEARCHED'
      | 'INITIAL_CONTACT'
      | 'MEETING_SCHEDULED'
      | 'IN_CONVERSATION'
      | 'PROPOSAL_SENT'
      | 'ACTIVATED'
      | 'INACTIVE'
      | null;
    active: boolean;
    updatedAt: Date;
  };

  let templates: Row[] = [];
  try {
    templates = await prisma.messageTemplate.findMany({
      orderBy: [{ active: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        kind: true,
        name: true,
        subject: true,
        body: true,
        stage: true,
        active: true,
        updatedAt: true,
      },
    });
  } catch {
    templates = [];
  }

  const activeCount = templates.filter((t) => t.active).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-card-border bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Message templates</h1>
          <p className="text-xs text-gray-500">
            {activeCount} active · {templates.length - activeCount} archived · shared across the
            tenant
          </p>
        </div>
        <div className="ml-auto">
          <NewTemplateButton />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-white">
        {templates.length === 0 ? (
          <div className="p-10 text-center">
            <Mail className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No templates yet</h3>
            <p className="text-xs text-gray-500">
              Click "+ New template" to create the first one. Use {'{{partner_name}}'},{' '}
              {'{{contact_first_name}}'}, and {'{{rep_first_name}}'} to personalise each send.
            </p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Kind</TH>
                <TH>Stage</TH>
                <TH>Preview</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{t.name}</span>
                      {t.kind === 'EMAIL' && t.subject ? (
                        <span className="truncate text-[11px] text-gray-500">{t.subject}</span>
                      ) : null}
                    </div>
                  </TD>
                  <TD>
                    {t.kind === 'EMAIL' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <Mail className="h-3.5 w-3.5 text-gray-500" /> Email
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <MessageSquare className="h-3.5 w-3.5 text-gray-500" /> SMS
                      </span>
                    )}
                  </TD>
                  <TD>
                    {t.stage ? (
                      <Pill color="#0ea5e9" tone="soft">
                        {humanizeStage(t.stage)}
                      </Pill>
                    ) : (
                      <span className="text-xs text-gray-400">Any</span>
                    )}
                  </TD>
                  <TD>
                    <span className="line-clamp-2 max-w-sm text-xs text-gray-600">
                      {t.body.slice(0, 160)}
                      {t.body.length > 160 ? '…' : ''}
                    </span>
                  </TD>
                  <TD>
                    {t.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Archived
                      </span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <TemplateRowActions
                      template={{
                        id: t.id,
                        kind: t.kind,
                        name: t.name,
                        subject: t.subject,
                        body: t.body,
                        stage: t.stage,
                        active: t.active,
                      }}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function humanizeStage(stage: string): string {
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
