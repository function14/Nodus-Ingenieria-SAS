import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface AuditRecord {
  seq: number;
  action: string;
  entityType: string;
  entityId: string;
  fromState: string | null;
  toState: string | null;
  payload: unknown;
}

// JSON canonico con claves ordenadas: determinista aunque jsonb reordene las
// claves al leerlas de Postgres (clave para que verifyChain valide bien).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// Cadena de hashes de la bitacora: rowHash = H(prevHash | contenido canonico).
// La MISMA funcion la usan seed, motor de workflow y verificacion.
export function computeRowHash(prevHash: string | null, rec: AuditRecord): string {
  const canonical = stableStringify([
    rec.seq,
    rec.action,
    rec.entityType,
    rec.entityId,
    rec.fromState,
    rec.toState,
    rec.payload,
  ]);
  return createHash('sha256')
    .update((prevHash ?? 'GENESIS') + '|' + canonical)
    .digest('hex');
}

export type DbLike = PrismaClient | Prisma.TransactionClient;

/**
 * Append atómico a la bitácora encadenada dentro de cualquier tx/client:
 * lee el ultimo eslabon, calcula el hash y escribe. Sirve para que los
 * registros de dominio fuera del workflow (p. ej. DOCUMENTO_SUBIDO /
 * DOCUMENTO_DESCARGADO de F3) sigan el MISMO mecanismo append-only.
 */
export async function appendAuditRow(params: {
  prisma: DbLike;
  tenantId: string;
  actorId?: string | null;
  caseId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  fromState?: string | null;
  toState?: string | null;
  payload?: unknown;
}): Promise<{ seq: number; rowHash: string }> {
  const last = await params.prisma.auditLog.findFirst({
    where: { tenantId: params.tenantId },
    orderBy: { seq: 'desc' },
    select: { seq: true, rowHash: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  const rec: AuditRecord = {
    seq,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    fromState: params.fromState ?? null,
    toState: params.toState ?? null,
    payload: params.payload ?? {},
  };
  const rowHash = computeRowHash(last?.rowHash ?? null, rec);
  await params.prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      seq,
      caseId: params.caseId ?? null,
      actorId: params.actorId ?? null,
      action: rec.action,
      entityType: rec.entityType,
      entityId: rec.entityId,
      fromState: rec.fromState,
      toState: rec.toState,
      payload: rec.payload as object,
      prevHash: last?.rowHash ?? null,
      rowHash,
    },
  });
  return { seq, rowHash };
}
