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
  'case.clarification': ['advisory', 'admin'],
  'postulation.create': ['consultor'],
  'consultant.setStatus': ['advisory', 'admin'],
  'consultant.profile': ['consultor'],
  'sla.sweep': ['advisory', 'admin'],
  'document.upload': ['advisory', 'admin', 'consultor', 'mipyme'],
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

/**
 * Regla UNICA de acceso a la zona documental de un caso (F3, RT-022).
 * Reusa la misma semantica del masking pero es MAS estricta que el detalle:
 *   - consultor: solo los documentos de los casos que tiene ASIGNADOS;
 *   - mipyme: solo los casos de su empresa;
 *   - advisory/admin/system: acceso pleno (los demas han sido gated antes).
 * Subir o pedir la URL firmada de un caso que no corresponde -> FORBIDDEN.
 */
export function canAccessCaseDocuments(
  actor: Actor,
  kase: { assignedUserId: string | null; companyId: string | null },
): boolean {
  if (actor.role === 'consultor') return kase.assignedUserId === actor.id;
  if (actor.role === 'mipyme') return actor.companyId === kase.companyId;
  return true;
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

/**
 * Variables de una comunicación que revelan identidad del cliente y por tanto
 * deben pasar por el masking antes de renderizarse para un destinatario.
 */
const IDENTITY_VARS = ['empresa', 'titulo', 'title', 'company'] as const;

/**
 * Enmascara las variables de una comunicación según la MISMA regla que la
 * lista y el detalle de casos. Un aviso de difusión (p. ej. TCOM4, bolsa) se
 * guarda una sola vez, pero se renderiza por lector: el advisory ve la empresa
 * real y el consultor no asignado ve `MASKED_COMPANY`.
 */
export function maskCommunicationVars(
  actor: Pick<Actor, 'id' | 'role'>,
  kase: { assignedUserId: string | null },
  vars: Record<string, unknown>,
): Record<string, unknown> {
  if (!isCaseMaskedFor(actor, kase)) return vars;
  const out = { ...vars };
  for (const key of IDENTITY_VARS) {
    if (key in out) out[key] = key === 'empresa' || key === 'company' ? MASKED_COMPANY : MASKED_TITLE;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Alcance de notificaciones                                           */
/* ------------------------------------------------------------------ */

export type NotificationScope =
  /** PMO/Admin: todo el tenant. */
  | { kind: 'all' }
  /**
   * Consultor: lo suyo, lo de los casos que tiene asignados, y los avisos
   * de difusión a su rol (recipientRole='consultor' sin destinatario concreto).
   */
  | { kind: 'assignedCases'; role: 'consultor' }
  /**
   * Mipyme: lo suyo y lo de los casos de su empresa. NO hay difusión por rol:
   * un aviso "a todas las Mipymes" expondría casos de otras empresas cliente.
   */
  | { kind: 'ownCompany'; companyId: string }
  /** Sin empresa/rol reconocido: solo lo dirigido explícitamente al usuario. */
  | { kind: 'ownOnly' };

export function notificationScope(actor: Actor): NotificationScope {
  if (actor.role === 'advisory' || actor.role === 'admin') return { kind: 'all' };
  if (actor.role === 'consultor') return { kind: 'assignedCases', role: 'consultor' };
  if (actor.role === 'mipyme' && actor.companyId) {
    return { kind: 'ownCompany', companyId: actor.companyId };
  }
  return { kind: 'ownOnly' };
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida del consultor (F4, RF-027/028/030)                     */
/* ------------------------------------------------------------------ */

/** Rango del nivel del consultor (LOV `nivel_consultor`, dato en rbac). */
export const LEVEL_RANK: Record<string, number> = {
  junior: 1,
  'semi-senior': 2,
  senior: 3,
};

/** Rango de la complejidad del caso (LOV `complejidad`, dato en rbac). */
export const COMPLEXITY_RANK: Record<string, number> = {
  baja: 1,
  media: 2,
  alta: 3,
};

/**
 * Guarda de la bolsa (RF-027/028). La regla UNICA de elegibilidad del
 * consultor vive aqui, nunca en un resolver:
 *   status === 'habilitado'
 *   && availability !== 'ocupado'
 *   && (sin especialidades declaradas O su especialidad contiene el area del caso)
 *   && (nivel del consultor >= complejidad del caso)
 */
export function eligibleForBolsa(
  consultant: {
    status: string;
    specialtyCodes: string[];
    levelCode?: string | null;
    availability: string;
  },
  kase: { areaCode: string | null; complexityLevel: string | null },
): boolean {
  if (consultant.status !== 'habilitado') return false;
  if (consultant.availability === 'ocupado') return false;
  const bySpecialty =
    consultant.specialtyCodes.length === 0 ||
    (kase.areaCode !== null && consultant.specialtyCodes.includes(kase.areaCode));
  if (!bySpecialty) return false;
  const level = consultant.levelCode ? LEVEL_RANK[consultant.levelCode] : 0;
  const complexity = kase.complexityLevel ? COMPLEXITY_RANK[kase.complexityLevel] : 0;
  if (complexity > 0 && level > 0 && complexity > level) return false;
  return true;
}

/**
 * Ciclo de estado del consultor como DATO (workflow-as-data, F4):
 *   registrado -> en_validacion -> habilitado -> (condicionado/suspendido/inactivo)
 * Un paso invalido se rechaza como FORBIDDEN sin tocar la DB.
 */
export const CONSULTANT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  registrado: ['en_validacion'],
  en_validacion: ['habilitado', 'condicionado', 'suspendido', 'inactivo'],
  habilitado: ['condicionado', 'suspendido', 'inactivo'],
  condicionado: ['habilitado', 'suspendido', 'inactivo'],
  suspendido: ['en_validacion', 'inactivo'],
  inactivo: [],
} as const;

export function canSetConsultantStatus(from: string, to: string): boolean {
  return (CONSULTANT_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
