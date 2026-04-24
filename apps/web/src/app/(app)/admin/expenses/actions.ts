'use server';
import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@partnerradar/db';
import { auth } from '@/auth';
import { notifyExpenseApproved, notifyExpenseRejected } from '@/lib/notifications/expense-emails';

async function assertManagerPlus() {
  const session = await auth();
  if (!session?.user) throw new Error('UNAUTHORIZED');
  if (session.user.role === 'REP') throw new Error('FORBIDDEN');
  return session;
}

export async function approveExpense(expenseId: string) {
  const session = await assertManagerPlus();
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
    select: { id: true, amount: true, partnerId: true, approvalStatus: true },
  });
  if (expense.approvalStatus !== 'PENDING') {
    throw new Error(`Expense is already ${expense.approvalStatus.toLowerCase()}`);
  }
  await prisma.$transaction([
    prisma.expense.update({
      where: { id: expenseId },
      data: {
        approvalStatus: 'APPROVED',
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'expense',
        entityId: expenseId,
        action: 'approve',
        diff: { amount: expense.amount.toString() } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/expenses');
  revalidatePath(`/partners/${expense.partnerId}`);

  // Fire-and-forget approval email to the submitter.
  await notifyExpenseApproved(expenseId, session.user.name ?? session.user.email ?? 'Your manager');
}

export async function rejectExpense(expenseId: string, reason: string) {
  const session = await assertManagerPlus();
  if (!reason.trim()) throw new Error('Reason required');
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId },
    select: { id: true, partnerId: true, approvalStatus: true },
  });
  if (expense.approvalStatus !== 'PENDING') {
    throw new Error(`Expense is already ${expense.approvalStatus.toLowerCase()}`);
  }
  await prisma.$transaction([
    prisma.expense.update({
      where: { id: expenseId },
      data: {
        approvalStatus: 'REJECTED',
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: reason.trim(),
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entityType: 'expense',
        entityId: expenseId,
        action: 'reject',
        diff: { reason } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath('/admin/expenses');
  revalidatePath(`/partners/${expense.partnerId}`);

  await notifyExpenseRejected(
    expenseId,
    session.user.name ?? session.user.email ?? 'Your manager',
    reason.trim(),
  );
}
