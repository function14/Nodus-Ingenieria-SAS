import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { caseByIdInputSchema, caseListInputSchema } from '@nodus/schemas';
import { executeTransition, processOutbox, WorkflowError } from '@nodus/workflow';
import { protectedProcedure, router } from '../trpc';

const workflowCodeToTrpc: Record<
  string,
  'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST'
> = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  BAD_TRANSITION: 'BAD_REQUEST',
  INVALID_STATE: 'BAD_REQUEST',
  VERSION_CONFLICT: 'CONFLICT',
};

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
        auditLogs: { orderBy: { seq: 'asc' }, include: { actor: true } },
      },
    });
    if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
    return c;
  }),

  availableTransitions: protectedProcedure
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const c = await ctx.prisma.case.findFirst({
        where: { id: input.caseId, tenantId: ctx.user.tenantId },
        select: { currentStateId: true },
      });
      if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
      const transitions = await ctx.prisma.caseTransition.findMany({
        where: { fromStateId: c.currentStateId },
        include: { toState: true },
      });
      return transitions
        .filter((t) => t.allowedRoles.includes(ctx.user.role))
        .map((t) => ({ code: t.code, name: t.name, to: t.toState.name }));
    }),

  transition: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        transitionCode: z.string().min(1),
        expectedVersion: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executeTransition({
          caseId: input.caseId,
          transitionCode: input.transitionCode,
          actor: { id: ctx.user.id, role: ctx.user.role, tenantId: ctx.user.tenantId },
          expectedVersion: input.expectedVersion,
        });
        await processOutbox(ctx.user.tenantId);
        return result;
      } catch (e) {
        if (e instanceof WorkflowError) {
          throw new TRPCError({ code: workflowCodeToTrpc[e.code] ?? 'BAD_REQUEST', message: e.message });
        }
        throw e;
      }
    }),
});
