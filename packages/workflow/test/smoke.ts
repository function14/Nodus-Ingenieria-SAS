import { prisma, computeRowHash } from '@nodus/db';
import { executeTransition, processOutbox, WorkflowError } from '../src/index';

async function verifyChain(tenantId: string) {
  const rows = await prisma.auditLog.findMany({ where: { tenantId }, orderBy: { seq: 'asc' } });
  let prev: string | null = null;
  for (const r of rows) {
    const expected = computeRowHash(prev, {
      seq: r.seq,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      fromState: r.fromState,
      toState: r.toState,
      payload: r.payload,
    });
    if (r.prevHash !== prev || r.rowHash !== expected) {
      return { valid: false, brokenSeq: r.seq, count: rows.length };
    }
    prev = r.rowHash;
  }
  return { valid: true, brokenSeq: null as number | null, count: rows.length };
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow();
  const advisory = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id, role: { code: 'advisory' } },
  });
  const consultor = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id, role: { code: 'consultor' } },
  });
  const actorAdvisory = { id: advisory.id, role: 'advisory', tenantId: tenant.id };
  const actorConsultor = { id: consultor.id, role: 'consultor', tenantId: tenant.id };

  const kase = await prisma.case.findFirstOrThrow({
    where: { humanId: 'NOD-2026-008' },
    include: { currentState: true },
  });
  console.log('Caso', kase.humanId, '| estado inicial:', kase.currentState.code, '| v', kase.version);

  // 1. happy path: CREADO -> EN_REVISION
  const r1 = await executeTransition({
    caseId: kase.id,
    transitionCode: 'crear_revision',
    actor: actorAdvisory,
    expectedVersion: kase.version,
  });
  console.log('  [1] transicion:', r1.from, '->', r1.to, '| v', r1.version, '| auditSeq', r1.auditSeq);

  const n = await processOutbox(tenant.id);
  const timers = await prisma.slaTimer.count({ where: { caseId: kase.id, status: 'RUNNING' } });
  const notifs = await prisma.notification.count({ where: { caseId: kase.id } });
  console.log('  [2] outbox procesada:', n, '| SLA RUNNING:', timers, '| notificaciones:', notifs);

  // 3. guarda: rol invalido (consultor no puede clasificar)
  let forbidden = false;
  try {
    await executeTransition({ caseId: kase.id, transitionCode: 'clasificar', actor: actorConsultor });
  } catch (e) {
    forbidden = e instanceof WorkflowError && e.code === 'FORBIDDEN';
    console.log('  [3] rechazo por rol:', (e as WorkflowError).code);
  }

  // 4. guarda: estado invalido (cerrar no aplica en EN_REVISION)
  let invalidState = false;
  try {
    await executeTransition({ caseId: kase.id, transitionCode: 'cerrar', actor: actorAdvisory });
  } catch (e) {
    invalidState = e instanceof WorkflowError && e.code === 'INVALID_STATE';
    console.log('  [4] rechazo por estado:', (e as WorkflowError).code);
  }

  // 5. guarda: version stale (conflicto optimista)
  let versionConflict = false;
  try {
    await executeTransition({
      caseId: kase.id,
      transitionCode: 'clasificar',
      actor: actorAdvisory,
      expectedVersion: 0,
    });
  } catch (e) {
    versionConflict = e instanceof WorkflowError && e.code === 'VERSION_CONFLICT';
    console.log('  [5] rechazo por version stale:', (e as WorkflowError).code);
  }

  // 6. verificar cadena de hashes
  const chain = await verifyChain(tenant.id);
  console.log(
    '  [6] cadena:',
    chain.valid ? 'INTEGRA' : 'ROTA en seq ' + chain.brokenSeq,
    '(' + chain.count + ' registros)',
  );

  const ok =
    r1.to === 'EN_REVISION' &&
    n === 1 &&
    timers === 1 &&
    forbidden &&
    invalidState &&
    versionConflict &&
    chain.valid;
  console.log(ok ? '\nSMOKE OK' : '\nSMOKE FALLIDO');
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
