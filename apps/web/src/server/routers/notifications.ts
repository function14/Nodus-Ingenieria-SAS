import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@nodus/db';
import { isCaseMaskedFor, maskCommunicationVars, notificationScope } from '@nodus/rbac';
import { emailFrom, renderTemplate } from '@nodus/notifications';
import { resourceProcedure, router } from '../trpc';
import type { Context } from '../context';

type RenderVars = Record<string, string | number | null | undefined>;
type Actor = { id: string; role: string; tenantId: string; companyId?: string | null };

/**
 * Traduccion UNICA del alcance de @nodus/rbac a un filtro de Prisma.
 *
 * La usan `recent` y `emailDetail`: si cada una construyera el suyo podrian
 * divergir, y el detalle acabaria mostrando lo que la lista oculta — que es
 * exactamente el fallo que ya aparecio antes en los casos y en la bolsa.
 */
function scopedWhere(user: Actor): Prisma.NotificationWhereInput {
  const scope = notificationScope(user);
  const base: Prisma.NotificationWhereInput = { tenantId: user.tenantId };

  switch (scope.kind) {
    case 'all':
      return base;
    case 'assignedCases':
      return {
        ...base,
        OR: [
          { userId: user.id },
          { case: { assignedUserId: user.id } },
          // Difusion a su rol (p. ej. TCOM4, bolsa): se entera de la
          // oportunidad, pero el contenido pasa por el masking al renderizar.
          { recipientRole: scope.role, userId: null },
        ],
      };
    case 'ownCompany':
      // Sin difusion por rol: un aviso "a todas las Mipymes" expondria casos
      // de otras empresas cliente.
      return {
        ...base,
        OR: [{ userId: user.id }, { case: { companyId: scope.companyId } }],
      };
    case 'ownOnly':
      return { ...base, userId: user.id };
  }
}

interface Renderable {
  message: string;
  subject: string | null;
  templateCode: string | null;
  vars: Prisma.JsonValue | null;
  case: { assignedUserId: string | null } | null;
}

/**
 * Una comunicacion de difusion es UNA fila que cada rol debe ver distinta: se
 * re-renderiza por lector con las variables enmascaradas, en vez de devolver
 * el texto tal como se guardo. Quien decide si toca enmascarar es @nodus/rbac.
 */
function renderForReader(
  user: Actor,
  row: Renderable,
  tpl: { body?: string; subject?: string } | undefined,
): { message: string; subject: string | null } {
  const masked = Boolean(
    row.case && row.templateCode && row.vars && isCaseMaskedFor(user, row.case),
  );
  if (!masked) return { message: row.message, subject: row.subject };

  if (!tpl?.body) {
    // Sin cuerpo de plantilla no se puede re-renderizar; no se arriesga a
    // devolver el texto guardado, que lleva la empresa real.
    return { message: 'Aviso sobre un caso de la bolsa interna.', subject: null };
  }
  const vars = { ...(row.vars as Record<string, unknown>) };
  const safe = maskCommunicationVars(user, row.case!, vars) as RenderVars;
  return {
    message: renderTemplate(tpl.body, safe),
    subject: tpl.subject ? renderTemplate(tpl.subject, safe) : null,
  };
}

async function loadTemplates(prisma: Context['prisma'], codes: string[]) {
  const out = new Map<string, { body?: string; subject?: string }>();
  if (codes.length === 0) return out;
  const versions = await prisma.templateVersion.findMany({
    where: { template: { code: { in: codes } }, isActive: true },
    orderBy: { version: 'desc' },
    include: { template: { select: { code: true } } },
  });
  for (const v of versions) {
    if (!out.has(v.template.code)) {
      out.set(v.template.code, { body: v.body ?? undefined, subject: v.subject ?? undefined });
    }
  }
  return out;
}

export const notificationsRouter = router({
  recent: resourceProcedure('notifications').query(async ({ ctx }) => {
    const rows = await ctx.prisma.notification.findMany({
      where: scopedWhere(ctx.user),
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { case: { select: { assignedUserId: true } } },
    });

    const codes = [
      ...new Set(
        rows
          .filter((n) => n.case && n.templateCode && n.vars && isCaseMaskedFor(ctx.user, n.case))
          .map((n) => n.templateCode!),
      ),
    ];
    const tpls = await loadTemplates(ctx.prisma, codes);

    return rows.map((n) => {
      const view = renderForReader(ctx.user, n, tpls.get(n.templateCode ?? ''));
      return {
        id: n.id,
        type: n.type,
        message: view.message,
        read: n.read,
        createdAt: n.createdAt,
        templateCode: n.templateCode,
        recipientRole: n.recipientRole,
        channel: n.channel,
        deliveryStatus: n.deliveryStatus,
        recipientEmail: n.recipientEmail,
        subject: view.subject,
        sentAt: n.sentAt,
      };
    });
  }),

  /**
   * Vista previa del correo: exactamente lo que recibiria el destinatario, mas
   * la prueba de que la comunicacion quedo encadenada en la bitacora.
   *
   * Existe para que el canal email se pueda comprobar sin acceder a un buzon.
   * Sin proveedor configurado no se envia nada, pero la comunicacion sigue
   * siendo verificable de punta a punta: plantilla, variables sustituidas,
   * destinatario resuelto desde los datos y su eslabon en la cadena de hashes.
   */
  emailDetail: resourceProcedure('notifications')
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Mismo alcance que la lista: se reutiliza el filtro, no se reescribe.
      const row = await ctx.prisma.notification.findFirst({
        where: { AND: [{ id: input.id }, scopedWhere(ctx.user)] },
        include: { case: { select: { assignedUserId: true, humanId: true } } },
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.channel !== 'email') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta comunicacion no es de correo' });
      }

      const tpls = await loadTemplates(ctx.prisma, row.templateCode ? [row.templateCode] : []);
      const view = renderForReader(ctx.user, row, tpls.get(row.templateCode ?? ''));

      const version = row.templateCode
        ? await ctx.prisma.templateVersion.findFirst({
            where: { template: { code: row.templateCode }, isActive: true },
            orderBy: { version: 'desc' },
            select: { version: true },
          })
        : null;

      // El eslabon de bitacora que prueba que la comunicacion quedo encadenada.
      const log = await ctx.prisma.auditLog.findFirst({
        where: {
          tenantId: ctx.user.tenantId,
          entityType: 'Notification',
          entityId: row.id,
          action: 'COMUNICACION_ENVIADA',
        },
        orderBy: { seq: 'desc' },
        select: { seq: true, rowHash: true },
      });

      return {
        from: emailFrom(),
        to: row.recipientEmail,
        subject: view.subject,
        body: view.message,
        templateCode: row.templateCode,
        templateVersion: version?.version ?? null,
        eventType: row.type,
        recipientRole: row.recipientRole,
        deliveryStatus: row.deliveryStatus,
        sentAt: row.sentAt,
        caseHumanId: row.case?.humanId ?? null,
        auditSeq: log?.seq ?? null,
        auditHash: log?.rowHash ?? null,
      };
    }),
});
