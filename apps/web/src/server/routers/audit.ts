import { computeRowHash } from '@nodus/db';
import { protectedProcedure, router } from '../trpc';

export const auditRouter = router({
  verifyChain: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.auditLog.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { seq: 'asc' },
    });
    let prev: string | null = null;
    for (const r of rows) {
      const expected = computeRowHash(prev, {
        seq: r.seq,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        fromState: r.fromState,
        toState: r.toState,
        payload: r.payload,
      });
      if (r.prevHash !== prev || r.rowHash !== expected) {
        return { valid: false, brokenSeq: r.seq, count: rows.length };
      }
      prev = r.rowHash;
    }
    return { valid: true, brokenSeq: null as number | null, count: rows.length };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.auditLog.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { seq: 'desc' },
      take: 100,
      include: { actor: true, case: true },
    });
    return rows.map((r) => ({
      seq: r.seq,
      action: r.action,
      fromState: r.fromState,
      toState: r.toState,
      actor: r.actor?.name ?? 'system',
      caseHumanId: r.case?.humanId ?? null,
      createdAt: r.createdAt,
      rowHash: r.rowHash,
    }));
  }),
});
