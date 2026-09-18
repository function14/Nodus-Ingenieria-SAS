/**
 * Seleccion de destinatarios de correo (canal email).
 *
 * Decide A QUIEN se le notifica por email usando datos, no literales:
 *   - destinatario concreto (userId) -> el correo de ese usuario.
 *   - difusion a rol `mipyme`       -> los usuarios de la empresa del caso.
 *   - difusion a rol `consultor`    -> el consultor asignado al caso.
 *   - difusion a rol `advisory`     -> los usuarios advisory del tenant.
 * Guarda el userId en la fila para trazabilidad. Hay deduplicacion por correo.
 * Los `overrideEmails` saltan la resolucion (desarrollo / pruebas / respaldo).
 */
import type { EmailRecipient } from './email';
import type { TxOrClient } from './types';

export interface ResolveEmailRecipientsParams {
  prisma: TxOrClient;
  tenantId: string;
  caseId?: string | null;
  userId?: string | null;
  recipientRole?: string | null;
  /** Email(s) forzados (desarrollo/pruebas): reemplazan la resolucion. */
  overrideEmails?: string[] | string | null;
}

const userSelect = { id: true, name: true, email: true } as const;

function dedupe(items: EmailRecipient[]): EmailRecipient[] {
  const seen = new Set<string>();
  const result: EmailRecipient[] = [];
  for (const it of items) {
    if (seen.has(it.email)) continue;
    seen.add(it.email);
    result.push(it);
  }
  return result;
}

export async function resolveEmailRecipients(
  p: ResolveEmailRecipientsParams,
): Promise<EmailRecipient[]> {
  // Override de desarrollo/pruebas: eleccion explicita sin tocar la DB.
  if (p.overrideEmails) {
    const list = Array.isArray(p.overrideEmails) ? p.overrideEmails : [p.overrideEmails];
    return dedupe(
      list
        .map((e) => e?.trim())
        .filter((e): e is string => Boolean(e))
        .map((email) => ({ userId: null, email, name: '' })),
    );
  }

  const out: EmailRecipient[] = [];

  if (p.userId) {
    const u = await p.prisma.user.findFirst({
      where: { id: p.userId, tenantId: p.tenantId },
      select: userSelect,
    });
    if (u?.email) out.push({ userId: u.id, email: u.email, name: u.name });
  }

  if (p.caseId) {
    const kase = await p.prisma.case.findUnique({
      where: { id: p.caseId },
      select: { companyId: true, assignedUserId: true },
    });

    if (kase && p.recipientRole === 'mipyme') {
      const users = await p.prisma.user.findMany({
        where: { tenantId: p.tenantId, companyId: kase.companyId, role: { code: 'mipyme' } },
        select: userSelect,
      });
      for (const u of users) if (u.email) out.push({ userId: u.id, email: u.email, name: u.name });
    }

    if (kase && p.recipientRole === 'consultor' && kase.assignedUserId) {
      const u = await p.prisma.user.findFirst({
        where: { id: kase.assignedUserId, tenantId: p.tenantId },
        select: userSelect,
      });
      if (u?.email) out.push({ userId: u.id, email: u.email, name: u.name });
    }
  }

  if (p.recipientRole === 'advisory') {
    const users = await p.prisma.user.findMany({
      where: { tenantId: p.tenantId, role: { code: 'advisory' } },
      select: userSelect,
    });
    for (const u of users) if (u.email) out.push({ userId: u.id, email: u.email, name: u.name });
  }

  return dedupe(out);
}