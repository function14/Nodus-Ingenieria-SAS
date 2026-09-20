import type { Prisma } from '@nodus/db';
import { isCaseMaskedFor, maskCommunicationVars, notificationScope } from '@nodus/rbac';
import { renderTemplate } from '@nodus/notifications';
import { resourceProcedure, router } from '../trpc';

type RenderVars = Record<string, string | number | null | undefined>;

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
            // Difusion a su rol (p. ej. TCOM4, bolsa): el consultor SI debe
            // enterarse de la oportunidad, pero el contenido pasa por el
            // masking al renderizarse mas abajo.
            { recipientRole: scope.role, userId: null },
          ],
        };
        break;
      case 'ownCompany':
        // Sin difusion por rol: un aviso "a todas las Mipymes" expondria
        // casos de otras empresas cliente.
        where = {
          ...where,
          OR: [{ userId: ctx.user.id }, { case: { companyId: scope.companyId } }],
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
      include: { case: { select: { assignedUserId: true } } },
    });

    // Una comunicacion de difusion es UNA fila que cada rol debe ver distinta.
    // Se re-renderiza por lector con las variables enmascaradas, en vez de
    // devolver el texto tal como se guardo. Quien decide si toca enmascarar es
    // @nodus/rbac, la misma funcion que usan la lista y el detalle de casos.
    const needsMask = (n: (typeof rows)[number]) =>
      Boolean(n.case && n.templateCode && n.vars && isCaseMaskedFor(ctx.user, n.case));

    const bodies = new Map<string, string>();
    const subjects = new Map<string, string>();
    const codes = [...new Set(rows.filter(needsMask).map((n) => n.templateCode!))];
    if (codes.length > 0) {
      const versions = await ctx.prisma.templateVersion.findMany({
        where: { template: { code: { in: codes } }, isActive: true },
        orderBy: { version: 'desc' },
        include: { template: { select: { code: true } } },
      });
      for (const v of versions) {
        if (v.body && !bodies.has(v.template.code)) bodies.set(v.template.code, v.body);
        if (v.subject && !subjects.has(v.template.code)) subjects.set(v.template.code, v.subject);
      }
    }

    return rows.map((n) => {
      let message = n.message;
      let subject = n.subject;
      if (needsMask(n)) {
        const body = bodies.get(n.templateCode!);
        if (body) {
          const vars = { ...(n.vars as Record<string, unknown>) };
          delete vars.__to; // destinatario interno del canal email
          const safe = maskCommunicationVars(ctx.user, n.case!, vars) as RenderVars;
          message = renderTemplate(body, safe);
          const subjTpl = subjects.get(n.templateCode!);
          if (subjTpl) subject = renderTemplate(subjTpl, safe);
        } else {
          // Sin cuerpo de plantilla no se puede re-renderizar; no se arriesga
          // a devolver el texto guardado, que lleva la empresa real.
          message = 'Aviso sobre un caso de la bolsa interna.';
          subject = null;
        }
      }
      return {
        id: n.id,
        type: n.type,
        message,
        read: n.read,
        createdAt: n.createdAt,
        templateCode: n.templateCode,
        recipientRole: n.recipientRole,
        channel: n.channel,
        deliveryStatus: n.deliveryStatus,
        // Registro de envio (RT-013): permite comprobar el canal email desde
        // la propia aplicacion, sin depender de acceder a un buzon.
        recipientEmail: n.recipientEmail,
        subject,
        sentAt: n.sentAt,
      };
    });
  }),
});
