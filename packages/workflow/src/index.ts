import { prisma, computeRowHash } from '@nodus/db';

export type WorkflowErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'BAD_TRANSITION'
  | 'INVALID_STATE'
  | 'VERSION_CONFLICT';

export class WorkflowError extends Error {
  constructor(
    public code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export interface TransitionActor {
  id: string;
  role: string;
  tenantId: string;
}

export interface TransitionResult {
  caseId: string;
  from: string;
  to: string;
  version: number;
  auditSeq: number;
  eventId: string;
}

// Evaluador de guardas declarativas (JSON). Punto de extension del Dia 2;
// las guardas siempre activas (rol, estado, version) van en executeTransition.
function evaluateGuards(guards: unknown, ctx: { assignedUserId: string | null }): void {
  if (!Array.isArray(guards)) return;
  for (const g of guards) {
    const rule = g as { type?: string };
    if (rule?.type === 'assigneeRequired' && !ctx.assignedUserId) {
      throw new WorkflowError('INVALID_STATE', 'La transicion requiere un consultor asignado');
    }
  }
}

/**
 * Ejecuta una transicion de forma transaccional y gobernada:
 * verify guards -> change state (CAS) -> append bitacora encadenada -> emit evento.
 * Todo dentro de una unica transaccion (o todo, o nada).
 */
export async function executeTransition(params: {
  caseId: string;
  transitionCode: string;
  actor: TransitionActor;
  expectedVersion?: number;
}): Promise<TransitionResult> {
  const { caseId, transitionCode, actor, expectedVersion } = params;

  return prisma.$transaction(async (tx) => {
    const kase = await tx.case.findUnique({ where: { id: caseId } });
    if (!kase || kase.tenantId !== actor.tenantId) {
      throw new WorkflowError('NOT_FOUND', 'Caso no encontrado');
    }

    const transition = await tx.caseTransition.findUnique({
      where: { code: transitionCode },
      include: { fromState: true, toState: true },
    });
    if (!transition) throw new WorkflowError('BAD_TRANSITION', 'Transicion inexistente');

    // --- GUARDAS ---
    if (transition.fromStateId !== kase.currentStateId) {
      throw new WorkflowError('INVALID_STATE', 'La transicion no aplica al estado actual del caso');
    }
    if (expectedVersion !== undefined && expectedVersion !== kase.version) {
      throw new WorkflowError('VERSION_CONFLICT', 'El caso cambio; recarga e intenta de nuevo');
    }
    if (!transition.allowedRoles.includes(actor.role)) {
      throw new WorkflowError('FORBIDDEN', 'Tu rol no puede ejecutar esta transicion');
    }
    evaluateGuards(transition.guards, { assignedUserId: kase.assignedUserId });

    // --- CAMBIO DE ESTADO: compare-and-swap atomico (defensa ante carreras) ---
    const swap = await tx.case.updateMany({
      where: { id: caseId, currentStateId: transition.fromStateId, version: kase.version },
      data: { currentStateId: transition.toStateId, version: { increment: 1 } },
    });
    if (swap.count !== 1) {
      throw new WorkflowError('VERSION_CONFLICT', 'El caso cambio durante la transicion');
    }

    // --- BITACORA ENCADENADA (append-only) ---
    const last = await tx.auditLog.findFirst({
      where: { tenantId: actor.tenantId },
      orderBy: { seq: 'desc' },
      select: { seq: true, rowHash: true },
    });
    const seq = (last?.seq ?? 0) + 1;
    const rec = {
      seq,
      action: 'CASO_TRANSICION',
      entityType: 'Case',
      entityId: caseId,
      fromState: transition.fromState.code,
      toState: transition.toState.code,
      payload: { transition: transition.code, actorId: actor.id } as unknown,
    };
    const rowHash = computeRowHash(last?.rowHash ?? null, rec);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        seq,
        caseId,
        actorId: actor.id,
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

    // --- EVENTO A LA OUTBOX (se consume tras el commit) ---
    const event = await tx.domainEvent.create({
      data: {
        tenantId: actor.tenantId,
        type: 'CASE_TRANSITIONED',
        payload: {
          caseId,
          from: transition.fromState.code,
          to: transition.toState.code,
          transition: transition.code,
          actorId: actor.id,
        },
      },
    });

    return {
      caseId,
      from: transition.fromState.code,
      to: transition.toState.code,
      version: kase.version + 1,
      auditSeq: seq,
      eventId: event.id,
    };
  });
}

interface TransitionedPayload {
  caseId: string;
  from: string;
  to: string;
  transition: string;
  actorId: string;
}

/**
 * Consumidor in-process de la outbox: crea el timer de SLA de la nueva etapa,
 * detiene el anterior y genera una notificacion. Idempotente (solo PENDING).
 * En prod esto lo hace un worker BullMQ leyendo domain_events.
 */
export async function processOutbox(tenantId: string): Promise<number> {
  const pending = await prisma.domainEvent.findMany({
    where: { tenantId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  let processed = 0;
  for (const event of pending) {
    await prisma.$transaction(async (tx) => {
      if (event.type === 'CASE_TRANSITIONED' || event.type === 'CASE_CREATED') {
        const p = event.payload as unknown as TransitionedPayload;

        // detener el timer activo del caso
        await tx.slaTimer.updateMany({
          where: { caseId: p.caseId, status: 'RUNNING' },
          data: { status: 'STOPPED' },
        });

        // arrancar timer de la nueva etapa (si hay regla y no es terminal)
        const rule = await tx.slaRule.findUnique({ where: { stateCode: p.to } });
        const toState = await tx.caseState.findUnique({ where: { code: p.to } });
        if (rule && toState && !toState.isTerminal) {
          const dueAt = new Date(Date.now() + rule.hours * 3600 * 1000);
          await tx.slaTimer.create({
            data: { caseId: p.caseId, ruleId: rule.id, dueAt, status: 'RUNNING' },
          });
        }

        // notificacion in-app
        const kase = await tx.case.findUnique({ where: { id: p.caseId } });
        const verb = event.type === 'CASE_CREATED' ? 'creado en' : 'paso a';
        await tx.notification.create({
          data: {
            tenantId,
            caseId: p.caseId,
            type: event.type,
            message: 'Caso ' + (kase?.humanId ?? p.caseId) + ' ' + verb + ' ' + p.to,
          },
        });
      }

      await tx.domainEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    });
    processed += 1;
  }

  return processed;
}
