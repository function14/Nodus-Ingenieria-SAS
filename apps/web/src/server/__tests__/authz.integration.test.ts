import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@nodus/db';
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

async function expectForbidden(fn: () => Promise<unknown>) {
  await expect(fn()).rejects.toMatchObject({ code: 'FORBIDDEN' });
}

let advisory: TestUser;
let consultor: TestUser;
let mipyme: TestUser;
let unassignedCaseId: string;
let assignedCaseId: string;
let realCompanyName: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();

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

  const assigned = await prisma.case.findFirstOrThrow({
    where: { assignedUserId: consultor.id },
  });
  assignedCaseId = assigned.id;

  const unassigned = await prisma.case.findFirstOrThrow({
    where: { assignedUserId: null },
    include: { company: true },
  });
  unassignedCaseId = unassigned.id;
  realCompanyName = unassigned.company.name;
});

/* ------------------------------------------------------------------ */
describe('G1 - el detalle aplica el MISMO masking que la lista', () => {
  it('consultor NO ve la empresa real en un caso no asignado', async () => {
    const res = await callerFor(consultor).cases.byId({ id: unassignedCaseId });
    expect(res.masked).toBe(true);
    expect(res.company.name).toBe('Empresa reservada');
    expect(res.company.name).not.toBe(realCompanyName);
    expect(res.title).toBe('Caso reservado');
  });

  it('tampoco se filtra por la submission ni por el payload de bitacora', async () => {
    const res = await callerFor(consultor).cases.byId({ id: unassignedCaseId });
    expect(res.submissions).toHaveLength(0);
    for (const log of res.auditLogs) {
      expect(log.payload).toEqual({});
    }
  });

  it('consultor SI ve los datos de su caso asignado', async () => {
    const res = await callerFor(consultor).cases.byId({ id: assignedCaseId });
    expect(res.masked).toBe(false);
    expect(res.company.name).not.toBe('Empresa reservada');
  });

  it('advisory ve la empresa real', async () => {
    const res = await callerFor(advisory).cases.byId({ id: unassignedCaseId });
    expect(res.masked).toBe(false);
    expect(res.company.name).toBe(realCompanyName);
  });

  it('lista y detalle coinciden para el mismo caso', async () => {
    const list = await callerFor(consultor).cases.list(undefined);
    const row = list.find((r) => r.id === unassignedCaseId);
    expect(row?.masked).toBe(true);
    expect(row?.company).toBe('Empresa reservada');
  });
});

/* ------------------------------------------------------------------ */
describe('G2 - guard server-side en rutas fuera del nav', () => {
  it('consultor no lee el directorio de empresas', () =>
    expectForbidden(() => callerFor(consultor).companies.overview()));

  it('mipyme no lee el directorio de consultores', () =>
    expectForbidden(() => callerFor(mipyme).consultants.list()));

  it('mipyme no lee el ledger de bitacora', () =>
    expectForbidden(() => callerFor(mipyme).audit.list()));

  it('consultor no lee la definicion del workflow', () =>
    expectForbidden(() => callerFor(consultor).workflow.graph()));

  it('consultor no lee el dashboard PMO', () =>
    expectForbidden(() => callerFor(consultor).dashboard.pmo()));

  it('mipyme no lee la bolsa', () =>
    expectForbidden(() => callerFor(mipyme).postulations.bolsa()));

  it('advisory si tiene acceso a esos recursos', async () => {
    await expect(callerFor(advisory).companies.overview()).resolves.toBeInstanceOf(Array);
    await expect(callerFor(advisory).audit.list()).resolves.toBeInstanceOf(Array);
    await expect(callerFor(advisory).consultants.list()).resolves.toBeInstanceOf(Array);
  });
});

/* ------------------------------------------------------------------ */
describe('G3 - alertas acotadas por rol / empresa / asignacion', () => {
  it('advisory ve todas las notificaciones del tenant', async () => {
    const all = await callerFor(advisory).notifications.recent();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it('consultor solo ve lo suyo, sus casos y la difusion de bolsa (enmascarada)', async () => {
    const mine = await callerFor(consultor).notifications.recent();
    expect(mine.length).toBeGreaterThan(0);

    // Comparar longitudes del feed no mide alcance: la consulta esta topada en
    // 20 y ambos roles llegan al tope. Se compara el universo real.
    const visiblesConsultor = await prisma.notification.count({
      where: {
        tenantId: consultor.tenantId,
        OR: [
          { userId: consultor.id },
          { case: { assignedUserId: consultor.id } },
          { recipientRole: 'consultor', userId: null },
        ],
      },
    });
    const totalTenant = await prisma.notification.count({ where: { tenantId: consultor.tenantId } });
    expect(visiblesConsultor).toBeLessThan(totalTenant);

    const assignedIds = (
      await prisma.case.findMany({ where: { assignedUserId: consultor.id }, select: { id: true } })
    ).map((c) => c.id);
    const rows = await prisma.notification.findMany({
      where: { id: { in: mine.map((n) => n.id) } },
      select: { id: true, caseId: true, userId: true, recipientRole: true },
    });
    for (const r of rows) {
      const propia = r.userId === consultor.id;
      const deSuCaso = r.caseId !== null && assignedIds.includes(r.caseId);
      // La difusion de bolsa es legitima (RF-026/028: el consultor debe
      // enterarse de la oportunidad); lo que no puede llevar es identidad del
      // cliente, y eso lo fija el test de regresion de comms.
      const difusion = r.userId === null && r.recipientRole === 'consultor';
      expect(propia || deSuCaso || difusion).toBe(true);
    }
  });

  it('mipyme solo ve las de los casos de su empresa', async () => {
    expect(mipyme.companyId).toBeTruthy();
    const mine = await callerFor(mipyme).notifications.recent();
    expect(mine.length).toBeGreaterThan(0);

    const visiblesMipyme = await prisma.notification.count({
      where: {
        tenantId: mipyme.tenantId,
        OR: [{ userId: mipyme.id }, { case: { companyId: mipyme.companyId! } }],
      },
    });
    const totalTenant = await prisma.notification.count({ where: { tenantId: mipyme.tenantId } });
    expect(visiblesMipyme).toBeLessThan(totalTenant);

    const companyCaseIds = (
      await prisma.case.findMany({ where: { companyId: mipyme.companyId! }, select: { id: true } })
    ).map((c) => c.id);
    const rows = await prisma.notification.findMany({
      where: { id: { in: mine.map((n) => n.id) } },
      select: { caseId: true, userId: true },
    });
    for (const r of rows) {
      const ok = r.caseId === null ? r.userId === mipyme.id : companyCaseIds.includes(r.caseId);
      expect(ok).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
describe('Fase C - la autorizacion de mutaciones sigue igual (no regresion)', () => {
  it('consultor no puede asignar', () =>
    expectForbidden(() =>
      callerFor(consultor).cases.assign({ caseId: unassignedCaseId, consultorId: consultor.id }),
    ));

  it('advisory no puede postularse', () =>
    expectForbidden(() => callerFor(advisory).postulations.postular({ caseId: unassignedCaseId })));

  it('mipyme no puede correr el barrido SLA', () =>
    expectForbidden(() => callerFor(mipyme).sla.sweep()));
});
