/**
 * @nodus/notifications — Motor de comunicaciones gobernadas (F1).
 *
 * Traduce un evento del flujo en una o varias notificaciones usando la tabla
 * `CommunicationRule` (evento -> plantilla TCOM -> destinatario -> canal).
 * Toda la configuracion es DATO, no codigo:
 *   - el cuerpo vive en `TemplateVersion.body`
 *   - el mapping evento/plantilla/destinatario vive en `CommunicationRule`
 *   - el unico texto que vive en codigo es el de depuracion, no el de proceso.
 *
 * Reglas de oro:
 *   - Canal `in_app` siempre activo.
 *   - Canal `email` (Resend) solo si hay `RESEND_API_KEY`; sin ella degrada a
 *     in-app sin excepcion.
 *   - Cada envio se registra en la bitacora encadenada en la MISMA transaccion
 *     (se le pasa el `tx` de la transaccion del dominio).
 */
import { computeRowHash } from '@nodus/db';
import type { Prisma, PrismaClient } from '@nodus/db';
import { renderTemplate, renderSubject } from './render';
import { emailConfigured, sendEmail } from './email';
import { resolveEmailRecipients } from './recipients';
import type { TxOrClient } from './types';

export { renderTemplate, renderSubject, emailConfigured, sendEmail, resolveEmailRecipients };
export type { EmailResult, EmailRecipient } from './email';
export type { ResolveEmailRecipientsParams } from './recipients';
export type { TxOrClient };

export interface NotifyParams {
  prisma: TxOrClient;
  tenantId: string;
  /** evento del flujo (codigo de la tabla CommunicationRule, p.ej. `caso_creado`). */
  eventType: string;
  caseId?: string | null;
  actorId?: string | null;
  vars?: Record<string, string | number | null | undefined>;
  /** destinatario explicitamente dirigido; si esta vacio y el rol es consultor, se deriva del caso. */
  recipientUserId?: string | null;
  /** email(s) forzados como destinatarios (desarrollo/pruebas/respaldo). */
  emailTo?: string | string[] | null;
  /**
   * Cola conocida de la bitacora para CONTINUAR una cadena iniciada en otra
   * llamada dentro de la misma transaccion (varios notify() en un mismo tx).
   * El seq avanza de forma local, sin depender de re-leer la DB.
   */
  chainTail?: { seq: number; rowHash: string | null } | null;
}

export interface NotifyResult {
  notifications: number;
  emails: number;
  logs: number;
  applied: boolean;
  /** Siguiente eslabon de la cadena a continuar en otra llamada del mismo tx. */
  chainTail: { seq: number; rowHash: string | null };
}

interface ChainEntry {
  seq: number;
  rowHash: string | null;
}

async function appendCommunicationLog(ctx: {
  prisma: TxOrClient;
  tenantId: string;
  caseId: string | null;
  actorId: string | null;
  seq: number;
  prevHash: string | null;
  notificationId: string;
  eventType: string;
  templateCode: string;
  recipientRole: string | null;
  channel: string;
  deliveryStatus: string;
}): Promise<ChainEntry> {
  const rec = {
    seq: ctx.seq,
    action: 'COMUNICACION_ENVIADA',
    entityType: 'Notification',
    entityId: ctx.notificationId,
    fromState: null as string | null,
    toState: null as string | null,
    payload: {
      eventType: ctx.eventType,
      templateCode: ctx.templateCode,
      recipientRole: ctx.recipientRole,
      channel: ctx.channel,
      deliveryStatus: ctx.deliveryStatus,
    },
  };
  const rowHash = computeRowHash(ctx.prevHash, rec);
  await ctx.prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      seq: ctx.seq,
      caseId: ctx.caseId,
      actorId: ctx.actorId,
      action: rec.action,
      entityType: rec.entityType,
      entityId: rec.entityId,
      fromState: rec.fromState,
      toState: rec.toState,
      payload: rec.payload as object,
      prevHash: ctx.prevHash,
      rowHash,
    },
  });
  return { seq: ctx.seq, rowHash };
}

/**
 * Dispara una comunicacion gobernada por una regla de la tabla
 * `CommunicationRule`. No-op cuando el evento no tiene regla activa o la
 * plantilla no tiene cuerpo: asi los eventos futuros no exigen codigo nuevo.
 */
export async function notify(params: NotifyParams): Promise<NotifyResult> {
  const {
    prisma,
    tenantId,
    eventType,
    caseId = null,
    actorId = null,
    vars: rawVars = {},
    recipientUserId = null,
    emailTo = null,
    chainTail = null,
  } = params;

  const rules = await prisma.communicationRule.findMany({
    where: { eventType, active: true },
  });
  if (rules.length === 0) {
    return { notifications: 0, emails: 0, logs: 0, applied: false, chainTail: chainTail ?? { seq: 0, rowHash: null } };
  }

  // Enriquecimiento de contexto del caso (solo si el autor no lo envio ya).
  const vars: Record<string, string | number | null | undefined> = { ...rawVars };
  if (caseId) {
    const kase = await prisma.case.findUnique({
      where: { id: caseId },
      include: { company: true, currentState: true },
    });
    if (kase) {
      if (!('humanId' in vars)) vars.humanId = kase.humanId;
      if (!('empresa' in vars)) vars.empresa = kase.company.name;
      if (!('estado' in vars)) vars.estado = kase.currentState.code;
    }
  }

  const now = new Date();
  let chain: ChainEntry;
  if (chainTail && chainTail.seq > 0) {
    chain = { seq: chainTail.seq, rowHash: chainTail.rowHash };
  } else {
    const latest = await prisma.auditLog.findFirst({
      where: { tenantId },
      orderBy: { seq: 'desc' },
      select: { seq: true, rowHash: true },
    });
    chain = { seq: (latest?.seq ?? 0) + 1, rowHash: latest?.rowHash ?? null };
  }

  let notifications = 0;
  let emails = 0;
  let logs = 0;

  for (const rule of rules) {
    const tv = await prisma.templateVersion.findFirst({
      where: { template: { code: rule.templateCode }, isActive: true },
      orderBy: { version: 'desc' },
      include: { template: true },
    });
    if (!tv || !tv.body) continue;

    const body = renderTemplate(tv.body, vars);
    const subject = renderSubject(tv.subject, vars, tv.template.name);

    // Destinatario concreto: derivado del caso cuando el rol es consultor.
    let userId = recipientUserId;
    if (!userId && rule.recipientRole === 'consultor' && caseId) {
      const kase = await prisma.case.findUnique({
        where: { id: caseId },
        select: { assignedUserId: true },
      });
      userId = kase?.assignedUserId ?? null;
    }

    // Canal in-app: siempre activo.
    const inApp = await prisma.notification.create({
      data: {
        tenantId,
        caseId,
        userId,
        type: eventType,
        message: body,
        templateCode: rule.templateCode,
        recipientRole: rule.recipientRole,
        channel: 'in_app',
        deliveryStatus: 'sent',
        sentAt: now,
        // Se guardan para re-renderizar POR LECTOR y aplicar el masking:
        // un aviso de difusion es UNA fila que cada rol debe ver distinta.
        vars: vars as Prisma.InputJsonValue,
      },
    });
    notifications += 1;
    const inAppEntry = await appendCommunicationLog({
      prisma,
      tenantId,
      caseId,
      actorId,
      seq: chain.seq,
      prevHash: chain.rowHash,
      notificationId: inApp.id,
      eventType,
      templateCode: rule.templateCode,
      recipientRole: rule.recipientRole,
      channel: 'in_app',
      deliveryStatus: 'sent',
    });
    chain = { seq: inAppEntry.seq + 1, rowHash: inAppEntry.rowHash };
    logs += 1;

    // Canal email: se DEJA PENDIENTE, nunca se envia aqui.
    // notify() corre dentro de la transaccion de dominio; una llamada de red
    // dentro del tx bloquea filas y, si la transaccion revierte, el correo ya
    // salio y no se puede deshacer. El envio real lo hace
    // dispatchPendingEmails() despues del commit.
    if (rule.channel === 'email' && emailConfigured()) {
      const recipients = await resolveEmailRecipients({
        prisma,
        tenantId,
        caseId,
        userId,
        recipientRole: rule.recipientRole,
        overrideEmails: emailTo ? (Array.isArray(emailTo) ? emailTo : [emailTo]) : null,
      });

      for (const rc of recipients) {
        const emailRow = await prisma.notification.create({
          data: {
            tenantId,
            caseId,
            userId: rc.userId,
            type: eventType,
            message: body,
            templateCode: rule.templateCode,
            recipientRole: rule.recipientRole,
            channel: 'email',
            deliveryStatus: 'pending',
            vars: { ...vars, __to: rc.email } as Prisma.InputJsonValue,
          },
        });
        notifications += 1;
        emails += 1;
        const emailEntry = await appendCommunicationLog({
          prisma,
          tenantId,
          caseId,
          actorId,
          seq: chain.seq,
          prevHash: chain.rowHash,
          notificationId: emailRow.id,
          eventType,
          templateCode: rule.templateCode,
          recipientRole: rule.recipientRole,
          channel: 'email',
          deliveryStatus: 'pending',
        });
        chain = { seq: emailEntry.seq + 1, rowHash: emailEntry.rowHash };
        logs += 1;
      }
    }
  }

  return { notifications, emails, logs, applied: notifications > 0, chainTail: chain };
}
/**
 * Envia los correos que `notify()` dejo en estado `pending`.
 *
 * Corre FUERA de la transaccion de dominio (lo llama el consumidor de la
 * outbox tras el commit): asi ninguna llamada de red bloquea filas, y un
 * correo nunca se envia por una transaccion que despues revierte.
 *
 * Es idempotente: solo toma filas `channel='email' AND deliveryStatus='pending'`,
 * y el resultado del envio queda en la bitacora encadenada.
 */
export async function dispatchPendingEmails(params: {
  /** Cliente real, no un `tx`: esta funcion abre sus propias transacciones. */
  prisma: PrismaClient;
  tenantId: string;
  limit?: number;
}): Promise<{ sent: number; failed: number }> {
  const { prisma, tenantId, limit = 50 } = params;
  if (!emailConfigured()) return { sent: 0, failed: 0 };

  const pending = await prisma.notification.findMany({
    where: { tenantId, channel: 'email', deliveryStatus: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const vars = (row.vars ?? {}) as Record<string, string | number | null | undefined> & {
      __to?: string;
    };
    const to = vars.__to;
    if (!to) {
      failed += 1;
      continue;
    }

    const tv = await prisma.templateVersion.findFirst({
      where: { template: { code: row.templateCode ?? '' }, isActive: true },
      orderBy: { version: 'desc' },
      include: { template: true },
    });
    const subject = tv
      ? renderSubject(tv.subject, vars, tv.template.name)
      : (row.templateCode ?? 'NODUS');

    const outcome = await sendEmail({ to, subject, body: row.message });
    const status = outcome.ok ? 'sent' : outcome.skipped ? 'pending' : 'failed';
    if (status === 'pending') continue;
    if (outcome.ok) sent += 1;
    else failed += 1;

    // El resultado del envio es parte de la comunicacion: se audita encadenado.
    await prisma.$transaction(async (tx) => {
      await tx.notification.update({
        where: { id: row.id },
        data: { deliveryStatus: status, sentAt: new Date() },
      });
      const latest = await tx.auditLog.findFirst({
        where: { tenantId },
        orderBy: { seq: 'desc' },
        select: { seq: true, rowHash: true },
      });
      await appendCommunicationLog({
        prisma: tx,
        tenantId,
        caseId: row.caseId,
        actorId: null,
        seq: (latest?.seq ?? 0) + 1,
        prevHash: latest?.rowHash ?? null,
        notificationId: row.id,
        eventType: row.type,
        templateCode: row.templateCode ?? '',
        recipientRole: row.recipientRole,
        channel: 'email',
        deliveryStatus: status,
      });
    });
  }

  return { sent, failed };
}
