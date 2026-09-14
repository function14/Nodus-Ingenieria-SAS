import { TRPCError } from '@trpc/server';
import { caseByIdInputSchema, caseListInputSchema } from '@nodus/schemas';
import { protectedProcedure, router } from '../trpc';

export const casesRouter = router({
  list: protectedProcedure.input(caseListInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.case.findMany({
      where: {
        tenantId: ctx.user.tenantId,
        ...(input?.stateCode ? { currentState: { code: input.stateCode } } : {}),
      },
      include: { company: true, currentState: true, assignedUser: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((c) => ({
      id: c.id,
      humanId: c.humanId,
      title: c.title,
      company: c.company.name,
      state: { code: c.currentState.code, name: c.currentState.name, color: c.currentState.color },
      assignee: c.assignedUser?.name ?? null,
      updatedAt: c.updatedAt,
    }));
  }),

  byId: protectedProcedure.input(caseByIdInputSchema).query(async ({ ctx, input }) => {
    const c = await ctx.prisma.case.findFirst({
      where: { id: input.id, tenantId: ctx.user.tenantId },
      include: {
        company: true,
        currentState: true,
        assignedUser: true,
        auditLogs: { orderBy: { seq: 'asc' } },
      },
    });
    if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
    return c;
  }),
});
