import { protectedProcedure, router } from '../trpc';

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.company.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }),

  overview: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.company.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { cases: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      emailDomain: c.emailDomain,
      casos: c._count.cases,
    }));
  }),
});
