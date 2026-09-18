import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, computeRowHash } from '@nodus/db';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

const createCaller = createCallerFactory(appRouter);

interface TestUser {
  id: string;
  role: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  email: string;
}

function callerFor(user: TestUser) {
  const ctx = {
    prisma,
    session: { user, expires: new Date(Date.now() + 3_600_000).toISOString() },
  } as unknown as Context;
  return createCaller(ctx);
}

let advisory: TestUser;
let consultor: TestUser;
let mipyme: TestUser;
let tenantId: string;

async function expectChainIntegrity() {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { seq: 'asc' },
  });
  expect(logs.length).toBeGreaterThan(0);
  let prev: string | null = null;
  for (const log of logs) {
    expect(log.prevHash).toBe(prev);
    const rec = {
      seq: log.seq,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      fromState: log.fromState,
      toState: log.toState,
      payload: log.payload,
    };
    expect(computeRowHash(prev, rec)).toBe(log.rowHash);
    prev = log.rowHash;
  }
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
  tenantId = tenant.id;

  const load = async (roleCode: string): Promise<TestUser> => {
    const u = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, role: { code: roleCode } },
    });
    return {
      id: u.id,
      role: roleCode,
      tenantId: u.tenantId,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
    };
  };

  advisory = await load('advisory');
  consultor = await load('consultor');
  mipyme = await load('mipyme');
});

describe('F1 - comunicaciones gobernadas', () => {
  let caseId: string;

  it('al crear un caso se dispara la regla caso_creado -> TCOM1 (mipyme)', async () => {
    expect(mipyme.companyId).toBeTruthy();
    const created = await callerFor(mipyme).cases.create({
      companyId: mipyme.companyId!,
      data: {
        titulo: 'F1 integracion comunicaciones',
        area: 'estrategia',
        urgencia: 'media',
        descripcion: 'Caso de prueba del motor de comunicaciones gobernadas F1.',
      },
    });
    caseId = created.id;

    const notif = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM1' },
    });
    expect(notif).toBeTruthy();
    expect(notif!.channel).toBe('in_app');
    expect(notif!.deliveryStatus).toBe('sent');
    expect(notif!.recipientRole).toBe('mipyme');
    expect(notif!.message).toContain('RetailModa');
    expect(notif!.message).toContain(created.humanId);
  });

  it('la bitacora registra COMUNICACION_ENVIADA en la misma transaccion', async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { tenantId, entityType: 'Notification', action: 'COMUNICACION_ENVIADA' },
    });
    expect(entry).toBeTruthy();
    const payload = entry!.payload as { eventType?: string; templateCode?: string; channel?: string; deliveryStatus?: string };
    expect(payload.eventType).toBe('caso_creado');
    expect(payload.templateCode).toBe('TCOM1');
    expect(payload.channel).toBe('in_app');
    expect(payload.deliveryStatus).toBe('sent');
  });

  it('transicion crear_revision -> TCOM13 (avisos internos advisory)', async () => {
    await callerFor(advisory).cases.transition({
      caseId,
      transitionCode: 'crear_revision',
    });
    const notif = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM13' },
    });
    expect(notif).toBeTruthy();
    expect(notif!.recipientRole).toBe('advisory');
    expect(notif!.message).toContain('EN_REVISION');
  });

  it('clasificar -> TCOM3 (advisory) y TCOM4 difusion a consultores (bolsa)', async () => {
    await callerFor(advisory).cases.transition({ caseId, transitionCode: 'clasificar' });
    const t3 = await prisma.notification.findFirst({ where: { caseId, templateCode: 'TCOM3' } });
    expect(t3).toBeTruthy();
    expect(t3!.recipientRole).toBe('advisory');

    const t4 = await prisma.notification.findFirst({ where: { caseId, templateCode: 'TCOM4' } });
    expect(t4).toBeTruthy();
    expect(t4!.recipientRole).toBe('consultor');
    expect(t4!.userId).toBeNull();

    // difusion a rol: el consultor la ve pese a no estar asignado al caso
    const consultorView = await callerFor(consultor).notifications.recent();
    expect(consultorView.some((n) => n.templateCode === 'TCOM4')).toBe(true);
  });

  it('postulacion -> TCOM13 (postulacion_recibida)', async () => {
    await callerFor(consultor).postulations.postular({ caseId });
    const notif = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM13', message: { contains: 'postulacion_recibida' } },
    });
    expect(notif).toBeTruthy();
    expect(notif!.recipientRole).toBe('advisory');
  });

  it('asignar -> TCOM5 dirigido al consultor asignado y notificacion a la mipyme', async () => {
    await callerFor(advisory).cases.assign({ caseId, consultorId: consultor.id });

    const c5c = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM5', recipientRole: 'consultor' },
    });
    expect(c5c).toBeTruthy();
    expect(c5c!.userId).toBe(consultor.id);

    const c5m = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM5', recipientRole: 'mipyme' },
    });
    expect(c5m).toBeTruthy();
    expect(c5m!.userId).toBeNull();

    const consultorView = await callerFor(consultor).notifications.recent();
    const mine = consultorView.find((n) => n.id === c5c!.id);
    expect(mine?.templateCode).toBe('TCOM5');
    expect(mine?.channel).toBe('in_app');
    expect(mine?.deliveryStatus).toBe('sent');
  });

  it('consultor solo ve las TCOM5 dirigidas a el (no se filtra por rol ad-hoc)', async () => {
    const mineIds = new Set(
      (await prisma.case.findMany({ where: { assignedUserId: consultor.id }, select: { id: true } })).map(
        (c) => c.id,
      ),
    );
    const view = await callerFor(consultor).notifications.recent();
    for (const n of view.filter((x) => x.templateCode === 'TCOM5')) {
      const row = await prisma.notification.findUnique({
        where: { id: n.id },
        select: { caseId: true, userId: true },
      });
      const visible =
        row!.userId === consultor.id || (row!.caseId !== null && mineIds.has(row!.caseId));
      expect(visible).toBe(true);
    }
  });

  it('la hash-chain de la bitacora permanece integra tras las comunicaciones', async () => {
    await expectChainIntegrity();
  });
});