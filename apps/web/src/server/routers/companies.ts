import { protectedProcedure, router } from '../trpc';

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.company.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }),
});
