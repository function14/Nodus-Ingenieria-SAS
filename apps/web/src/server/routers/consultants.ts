import { protectedProcedure, router } from '../trpc';

export const consultantsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.user.findMany({
      where: { tenantId: ctx.user.tenantId, role: { code: 'consultor' } },
      include: { _count: { select: { assignedCases: true, postulations: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      asignados: u._count.assignedCases,
      postulaciones: u._count.postulations,
    }));
  }),
});
