import { prisma, computeRowHash } from '@nodus/db';
import { notify, dispatchPendingEmails } from '@nodus/notifications';

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
  companyId?: string | null;
}

export interface TransitionResult {
  caseId: string;
  from: string;
  to: string;
  version: number;
  auditSeq: number;
  eventId: string;
}

interface GuardContext {
  assignedUserId: string | null;
  actorId: string;
  actorRole: string;
  companyId: string | null;
  caseCompanyId: string | null;
}

// Evaluador de guardas declarativas (JSON). Punto de extension del Dia 2;
// las guardas siempre activas (rol, estado, version) van en executeTransition.
// Una guarda con `role` solo se evalua si la ejecuta un actor de ese rol.
function evaluateGuards(guards: unknown, ctx: GuardContext): void {
  if (!Array.isArray(guards)) return;
  for (const g of guards) {
    const rule = g as { type?: string; role?: string };
    if (rule?.role && rule.role !== ctx.actorRole) continue;
    switch (rule?.type) {
      case 'assigneeRequired':
        if (!ctx.assignedUserId) {
          throw new WorkflowError('INVALID_STATE', 'La transicion requiere un consultor asignado');
        }
        break;
      case 'assigneeMustAct':
        if (!ctx.assignedUserId || ctx.assignedUserId !== ctx.actorId) {
          throw new WorkflowError('FORBIDDEN', 'Solo el consultor asignado puede ejecutar esta transicion');
        }
        break;
      case 'companyOwnerMustAct':
        if (!ctx.caseCompanyId || ctx.caseCompanyId !== ctx.companyId) {
          throw new WorkflowError('FORBIDDEN', 'Solo la empresa duena del caso puede ejecutar esta transicion');
        }
        break;
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
    evaluateGuards(transition.guards, {
      assignedUserId: kase.assignedUserId,
      actorId: actor.id,
      actorRole: actor.role,
      companyId: actor.companyId ?? null,
      caseCompanyId: kase.companyId,
    });

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
    const effects = (transition.effects ?? {}) as { commEvent?: string; commEvents?: string[] };
    const commEvents = Array.isArray(effects.commEvents)
      ? effects.commEvents
      : effects.commEvent
        ? [effects.commEvent]
        : [];
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
          commEvents,
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
  commEvents?: string[];
}

/**
 * Consumidor in-process de la outbox: crea el timer de SLA de la nueva etapa,
 * detiene el anterior y dispara las comunicaciones gobernadas (reglas en
 * `CommunicationRule` -> plantillas TCOM). Idempotente (solo PENDING).
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

        // comunicaciones gobernadas: cada evento -> plantilla via CommunicationRule
        const commCodes =
          event.type === 'CASE_CREATED' ? ['caso_creado'] : (p.commEvents ?? []);
        let chainTail: { seq: number; rowHash: string | null } | null = null;
        for (const code of commCodes) {
          // Variables del evento: la solicitud de aclaracion (RF-035/T3A) se
          // agrega desde la submission estructurada guardada en el caso.
          const vars: Record<string, string> = {};
          if (code === 'solicitud_aclaracion') {
            const sub = await tx.formSubmission.findFirst({
              where: { caseId: p.caseId, templateVersion: { template: { code: 'T3A' } } },
              orderBy: { version: 'desc' },
            });
            const items = (sub?.data ?? {}) as { items?: Array<{ campo?: string; solicitud?: string }> };
            vars.solicitud = (items.items ?? [])
              .map((i) => i.solicitud ?? '')
              .filter(Boolean)
              .join('; ');
          }
          const res = await notify({
            prisma: tx,
            tenantId,
            eventType: code,
            caseId: p.caseId,
            actorId: p.actorId,
            vars,
            chainTail,
          });
          chainTail = res.chainTail;
        }
      }

      await tx.domainEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    });
    processed += 1;
  }

  // El correo se despacha DESPUES del commit: ninguna llamada de red ocurre
  // dentro de la transaccion de dominio.
  await dispatchPendingEmails({ prisma, tenantId });

  return processed;
}

/**
 * Barrido de SLA: marca timers en riesgo (WARN) o vencidos (BREACHED), crea
 * notificaciones, escalamiento y evento SLA_BREACHED. Idempotente. En prod lo
 * dispara un cron/worker; aca lo llama /api/cron/sla o un trigger manual.
 */
export async function sweepSla(tenantId?: string): Promise<{ warned: number; breached: number }> {
  const now = new Date();
  const timers = await prisma.slaTimer.findMany({
    where: {
      status: { in: ['RUNNING', 'WARN'] },
      ...(tenantId ? { case: { tenantId } } : {}),
    },
    include: { rule: true, case: true },
  });

  let warned = 0;
  let breached = 0;

  for (const t of timers) {
    const start = t.startedAt.getTime();
    const due = t.dueAt.getTime();
    const totalMs = Math.max(due - start, 1);
    const pct = ((now.getTime() - start) / totalMs) * 100;

    if (now.getTime() >= due) {
      await prisma.$transaction(async (tx) => {
        await tx.slaTimer.update({ where: { id: t.id }, data: { status: 'BREACHED', breachedAt: now } });
        await tx.domainEvent.create({
          data: { tenantId: t.case.tenantId, type: 'SLA_BREACHED', payload: { caseId: t.caseId, stage: t.rule.stateCode } },
        });
        const breached = await notify({
          prisma: tx,
          tenantId: t.case.tenantId,
          eventType: 'sla_breached',
          caseId: t.caseId,
          vars: { etapa: t.rule.stateCode, plazo: t.dueAt.toLocaleString('es-CO') },
        });
        if (t.rule.escalateRole) {
          await notify({
            prisma: tx,
            tenantId: t.case.tenantId,
            eventType: 'sla_escalado',
            caseId: t.caseId,
            vars: { etapa: t.rule.stateCode, escala: t.rule.escalateRole },
            chainTail: breached.chainTail,
          });
        }
      });
      breached += 1;
    } else if (pct >= t.rule.warnPct && t.status === 'RUNNING') {
      await prisma.$transaction(async (tx) => {
        await tx.slaTimer.update({ where: { id: t.id }, data: { status: 'WARN' } });
        await notify({
          prisma: tx,
          tenantId: t.case.tenantId,
          eventType: 'sla_warn',
          caseId: t.caseId,
          vars: { etapa: t.rule.stateCode, plazo: t.dueAt.toLocaleString('es-CO') },
        });
        await tx.domainEvent.create({
          data: { tenantId: t.case.tenantId, type: 'SLA_WARN', payload: { caseId: t.caseId, stage: t.rule.stateCode } },
        });
      });
      warned += 1;
    }
  }

  // Igual que en processOutbox: el correo sale tras los commits, nunca dentro.
  const tenants = tenantId
    ? [tenantId]
    : [...new Set(timers.map((t) => t.case.tenantId))];
  for (const id of tenants) {
    await dispatchPendingEmails({ prisma, tenantId: id });
  }

  return { warned, breached };
}
