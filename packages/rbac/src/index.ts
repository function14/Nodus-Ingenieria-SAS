/**
 * @nodus/rbac — ÚNICA fuente de verdad de "qué puede ver/hacer este rol".
 *
 * Todo el backend (procedures tRPC) y la navegación del cliente derivan de las
 * tablas de este módulo. No debe existir ningún chequeo de rol ad-hoc fuera de
 * aquí: si aparece un endpoint nuevo, se le asigna un recurso/acción y hereda
 * la protección automáticamente.
 *
 * Nota: la autorización de las TRANSICIONES de workflow NO vive aquí a propósito
 * — es data-driven (`CaseTransition.allowedRoles` en la DB), y esa tabla es su
 * propia fuente única. Ver packages/workflow.
 */

export type Role = 'advisory' | 'admin' | 'consultor' | 'mipyme' | 'system';

export interface Actor {
  id: string;
  role: string;
  tenantId: string;
  /** Empresa a la que pertenece el usuario (aplica a mipyme). */
  companyId?: string | null;
}

/** Recursos de LECTURA protegidos. */
export const RESOURCE_ACCESS = {
  dashboard: ['advisory', 'admin'],
  cases: ['advisory', 'admin', 'consultor', 'mipyme'],
  bolsa: ['advisory', 'admin', 'consultor'],
  companyDirectory: ['advisory', 'admin'],
  consultantDirectory: ['advisory', 'admin'],
  auditLedger: ['advisory', 'admin'],
  workflowDefinition: ['advisory', 'admin'],
  notifications: ['advisory', 'admin', 'consultor', 'mipyme'],
  profile: ['advisory', 'admin', 'consultor', 'mipyme'],
} as const satisfies Record<string, readonly Role[]>;

export type Resource = keyof typeof RESOURCE_ACCESS;

/** ACCIONES (mutaciones) protegidas. */
export const ACTION_ACCESS = {
  'case.create': ['advisory', 'admin', 'mipyme'],
  'case.assign': ['advisory'],
  'postulation.create': ['consultor'],
  'sla.sweep': ['advisory', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof ACTION_ACCESS;

export function canAccess(actor: Pick<Actor, 'role'>, resource: Resource): boolean {
  return (RESOURCE_ACCESS[resource] as readonly string[]).includes(actor.role);
}

export function canPerform(actor: Pick<Actor, 'role'>, action: Action): boolean {
  return (ACTION_ACCESS[action] as readonly string[]).includes(actor.role);
}

/**
 * Ruta pública de cada recurso. El NAV se deriva de la misma tabla de permisos,
 * de modo que ocultar un link y bloquear el dato nunca se desincronizan.
 */
export const RESOURCE_ROUTE: Record<Resource, string> = {
  dashboard: '/',
  cases: '/casos',
  bolsa: '/bolsa',
  companyDirectory: '/empresas',
  consultantDirectory: '/consultores',
  auditLedger: '/bitacora',
  workflowDefinition: '/workflow',
  notifications: '/alertas',
  profile: '/perfil',
};

/** Rutas visibles para un rol (el nav es un reflejo de los permisos). */
export function allowedRoutes(role: string): string[] {
  return (Object.keys(RESOURCE_ACCESS) as Resource[])
    .filter((resource) => canAccess({ role }, resource))
    .map((resource) => RESOURCE_ROUTE[resource]);
}

/* ------------------------------------------------------------------ */
/* Visibilidad de datos del caso (masking)                             */
/* ------------------------------------------------------------------ */

export const MASKED_COMPANY = 'Empresa reservada';
export const MASKED_TITLE = 'Caso reservado';

/**
 * Regla única de masking: el consultor no ve los datos del cliente salvo en
 * los casos asignados a él (D9: "datos sensibles enmascarados para postulantes
 * hasta la asignación"). La usan la lista Y el detalle.
 */
export function isCaseMaskedFor(
  actor: Pick<Actor, 'id' | 'role'>,
  kase: { assignedUserId: string | null },
): boolean {
  return actor.role === 'consultor' && kase.assignedUserId !== actor.id;
}

export interface MaskableCase {
  title: string;
  company: string;
}

/** Aplica el masking de forma consistente en cualquier proyección de caso. */
export function applyCaseMask<T extends MaskableCase>(
  actor: Pick<Actor, 'id' | 'role'>,
  kase: { assignedUserId: string | null },
  data: T,
): T & { masked: boolean } {
  const masked = isCaseMaskedFor(actor, kase);
  return masked
    ? { ...data, title: MASKED_TITLE, company: MASKED_COMPANY, masked }
    : { ...data, masked };
}

/* ------------------------------------------------------------------ */
/* Alcance de notificaciones                                           */
/* ------------------------------------------------------------------ */

export type NotificationScope =
  /** PMO/Admin: todo el tenant. */
  | { kind: 'all' }
  /** Consultor: solo lo suyo y lo de los casos que tiene asignados. */
  | { kind: 'assignedCases' }
  /** Mipyme: solo lo suyo y lo de los casos de su empresa. */
  | { kind: 'ownCompany'; companyId: string }
  /** Sin empresa/rol reconocido: solo lo dirigido explícitamente al usuario. */
  | { kind: 'ownOnly' };

export function notificationScope(actor: Actor): NotificationScope {
  if (actor.role === 'advisory' || actor.role === 'admin') return { kind: 'all' };
  if (actor.role === 'consultor') return { kind: 'assignedCases' };
  if (actor.role === 'mipyme' && actor.companyId) {
    return { kind: 'ownCompany', companyId: actor.companyId };
  }
  return { kind: 'ownOnly' };
}
