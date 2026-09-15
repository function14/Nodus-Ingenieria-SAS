import { createHash } from 'node:crypto';

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
