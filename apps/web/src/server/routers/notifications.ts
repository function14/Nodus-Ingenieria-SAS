import type { Prisma } from '@nodus/db';
import { notificationScope } from '@nodus/rbac';
import { resourceProcedure, router } from '../trpc';

export const notificationsRouter = router({
  recent: resourceProcedure('notifications').query(async ({ ctx }) => {
    // El "quien ve que" lo decide @nodus/rbac; aqui solo se traduce a Prisma.
    const scope = notificationScope(ctx.user);
    let where: Prisma.NotificationWhereInput = { tenantId: ctx.user.tenantId };

    switch (scope.kind) {
      case 'all':
        break;
      case 'assignedCases':
        where = {
          ...where,
          OR: [
            { userId: ctx.user.id },
            { case: { assignedUserId: ctx.user.id } },
            // Difusion a su rol: avisos dirigidos al rol sin destinatario concreto.
            { recipientRole: scope.role, userId: null },
          ],
        };
        break;
      case 'ownCompany':
        where = {
          ...where,
          OR: [
            { userId: ctx.user.id },
            { case: { companyId: scope.companyId } },
            { recipientRole: scope.role, userId: null },
          ],
        };
        break;
      case 'ownOnly':
        where = { ...where, userId: ctx.user.id };
        break;
    }

    const rows = await ctx.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      templateCode: n.templateCode,
      recipientRole: n.recipientRole,
      channel: n.channel,
      deliveryStatus: n.deliveryStatus,
    }));
  }),
});
