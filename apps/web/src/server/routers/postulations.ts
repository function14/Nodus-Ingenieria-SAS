import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { notify } from '@nodus/notifications';
import { actionProcedure, resourceProcedure, router } from '../trpc';

export const postulationsRouter = router({
  postular: actionProcedure('postulation.create')
    .input(z.object({ caseId: z.string().min(1), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.prisma.case.findFirst({
        where: { id: input.caseId, tenantId: ctx.user.tenantId },
        include: { currentState: true },
      });
      if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
      if (c.currentState.code !== 'CLASIFICADO') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El caso no esta en bolsa (CLASIFICADO)' });
      }
      const existing = await ctx.prisma.postulation.findUnique({
        where: { caseId_consultorId: { caseId: input.caseId, consultorId: ctx.user.id } },
      });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Ya te postulaste a este caso' });

      return ctx.prisma.$transaction(async (tx) => {
        const postulation = await tx.postulation.create({
          data: {
            tenantId: ctx.user.tenantId,
            caseId: input.caseId,
            consultorId: ctx.user.id,
            note: input.note,
          },
        });
        await notify({
          prisma: tx,
          tenantId: ctx.user.tenantId,
          eventType: 'postulacion_recibida',
          caseId: input.caseId,
          vars: { evento: 'postulacion_recibida' },
        });
        return postulation;
      });
    }),

  listForCase: resourceProcedure('bolsa')
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.postulation.findMany({
        where: { caseId: input.caseId, tenantId: ctx.user.tenantId },
        include: { consultor: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((p) => ({
        id: p.id,
        consultorId: p.consultorId,
        consultor: p.consultor.name,
        note: p.note,
        status: p.status,
        createdAt: p.createdAt,
      }));
    }),

  bolsa: resourceProcedure('bolsa').query(async ({ ctx }) => {
    const cases = await ctx.prisma.case.findMany({
      where: { tenantId: ctx.user.tenantId, currentState: { code: 'CLASIFICADO' } },
      include: { company: true, postulations: true },
      orderBy: { updatedAt: 'desc' },
    });
    return cases.map((c) => ({
      id: c.id,
      humanId: c.humanId,
      company: c.company.name,
      title: c.title,
      postulantes: c.postulations.length,
      yaPostulado: c.postulations.some((p) => p.consultorId === ctx.user.id),
    }));
  }),
});
