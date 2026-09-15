import { protectedProcedure, router } from '../trpc';

export const notificationsRouter = router({
  recent: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.notification.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
    }));
  }),
});
