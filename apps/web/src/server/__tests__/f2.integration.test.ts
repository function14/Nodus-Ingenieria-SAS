import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, computeRowHash } from '@nodus/db';
import { TRPCError } from '@trpc/server';
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
let consultor2: TestUser;
let mipyme: TestUser;
let tenantId: string;
let foodTechCompanyId: string;

async function stateOf(caseId: string) {
  return prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { currentState: { select: { code: true } }, version: true },
  });
}

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

async function expectRejected(
  run: () => Promise<unknown>,
  code: 'FORBIDDEN' | 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND',
): Promise<void> {
  let thrown: TRPCError | null = null;
  try {
    await run();
  } catch (e) {
    thrown = e as TRPCError;
  }
  expect(thrown).toBeInstanceOf(TRPCError);
  expect(thrown!.code).toBe(code);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
  tenantId = tenant.id;

  const load = async (roleCode: string): Promise<TestUser> => {
    const u = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, role: { code: roleCode } },
      orderBy: { createdAt: 'asc' },
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

  // Segundo consultor: demuestra que la guarda assigneeMustAct ata la
  // transicion al consultor ASIGNADO y no a cualquier consultor del rol.
  const consultorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'consultor' } });
  const u2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: 'consultor2@demo.nodus' } },
    update: { name: 'Diana Consultora' },
    create: {
      tenantId,
      email: 'consultor2@demo.nodus',
      name: 'Diana Consultora',
      passwordHash: 'x',
      roleId: consultorRole.id,
    },
  });
  consultor2 = {
    id: u2.id,
    role: 'consultor',
    tenantId: u2.tenantId,
    companyId: u2.companyId,
    name: u2.name,
    email: u2.email,
  };

  foodTechCompanyId = (
    await prisma.company.findFirstOrThrow({ where: { name: 'FoodTech SAS' } })
  ).id;
});

describe('F2 - recorrido completo CREADO -> CERRADO por los 9 puntos', () => {
  it('transita por cada fase del maestro de 17 estados respetando roles', async () => {
    expect(mipyme.companyId).toBeTruthy();
    const created = await callerFor(mipyme).cases.create({
      companyId: mipyme.companyId!,
      data: {
        titulo: 'F2 recorrido integral',
        area: 'estrategia',
        urgencia: 'media',
        descripcion: 'Recorrido completo del workflow F2 por los 9 puntos.',
      },
    });
    const caseId = created.id;
    const base = await stateOf(caseId);
    expect(base.currentState.code).toBe('CREADO');
    const initialVersion = base.version;

    const t = async (actor: TestUser, transitionCode: string, expected: string) => {
      const r = await callerFor(actor).cases.transition({ caseId, transitionCode });
      expect(r.to).toBe(expected);
      expect((await stateOf(caseId)).currentState.code).toBe(expected);
    };

    // punto 1-2: apertura, revision y clasificacion
    await t(advisory, 'crear_revision', 'EN_REVISION');
    await t(advisory, 'clasificar', 'CLASIFICADO');
    // punto 3: bolsa interna y asignacion
    await t(advisory, 'publicar_bolsa', 'EN_POSTULACION');
    await callerFor(consultor).postulations.postular({ caseId, note: 'Me interesa este caso.' });
    const asig = await callerFor(advisory).cases.assign({ caseId, consultorId: consultor.id });
    expect(asig.to).toBe('ASIGNADO');
    // punto 4-6: diseno, QA, envio, decision y ciclo de ajustes
    await t(consultor, 'iniciar_diseno', 'PROPUESTA_EN_DISENO');
    await t(consultor, 'propuesta_lista_qa', 'PROPUESTA_LISTA_QA');
    await t(advisory, 'autorizar_envio_propuesta', 'PROPUESTA_ENVIADA');
    await t(advisory, 'abrir_periodo_decision', 'EN_DECISION_CLIENTE');
    await t(mipyme, 'solicitar_ajustes', 'AJUSTES_DE_PROPUESTA');
    await t(consultor, 'reenviar_propuesta', 'PROPUESTA_ENVIADA');
    await t(advisory, 'abrir_periodo_decision', 'EN_DECISION_CLIENTE');
    await t(mipyme, 'aceptar_propuesta', 'PROPUESTA_ACEPTADA');
    // punto 7: contratacion y autorizacion
    await t(advisory, 'formalizar_contratacion', 'PENDIENTE_CONTRATACION');
    await t(advisory, 'autorizar_ejecucion', 'AUTORIZADO_EJECUCION');
    // punto 8: ejecucion
    await t(advisory, 'iniciar_ejecucion', 'EN_EJECUCION');
    // punto 9: cierre
    await t(consultor, 'listo_cierre', 'LISTO_PARA_CIERRE');
    await t(mipyme, 'cerrar', 'CERRADO');

    const fin = await stateOf(caseId);
    expect(fin.currentState.code).toBe('CERRADO');
    // 17 transiciones ejecutadas: 16 por cases.transition + 1 por cases.assign
    expect(fin.version).toBe(initialVersion + 17);

    await expectChainIntegrity();
  });

  it('emite las comunicaciones gobernadas de las fases (muestra no exhaustiva)', async () => {
    const kase = await prisma.case.findFirstOrThrow({
      where: { title: 'F2 recorrido integral', tenantId },
    });
    const caseId = kase.id;

    const t7 = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM7', recipientRole: 'consultor' },
    });
    expect(t7).toBeTruthy();
    expect(t7!.message).toContain(kase.humanId);

    const t10 = await prisma.notification.findMany({
      where: { caseId, templateCode: 'TCOM10' },
    });
    expect(t10.length).toBe(2);

    const t12 = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM12', recipientRole: 'mipyme' },
    });
    expect(t12).toBeTruthy();
    expect(t12!.message).toContain(kase.humanId);

    const t5 = await prisma.notification.findFirst({
      where: { caseId, templateCode: 'TCOM5', recipientRole: 'consultor' },
    });
    expect(t5).toBeTruthy();
    expect(t5!.userId).toBe(consultor.id);
  });
});

describe('F2 - restricciones por rol, guardas y estado', () => {
  let caseId: string;

  it('rechaza por estado y por rol (consultor/mipyme no clasifican)', async () => {
    const created = await callerFor(mipyme).cases.create({
      companyId: mipyme.companyId!,
      data: {
        titulo: 'F2 negativas rol',
        area: 'operaciones',
        urgencia: 'baja',
        descripcion: 'Caso para probar rechazos por rol y por estado en F2.',
      },
    });
    caseId = created.id;

    const cur = await stateOf(caseId);
    expect(cur.currentState.code).toBe('CREADO');

    // estado invalido: cerrar no aplica en CREADO
    await expectRejected(
      () => callerFor(advisory).cases.transition({ caseId, transitionCode: 'cerrar' }),
      'BAD_REQUEST',
    );

    await callerFor(advisory).cases.transition({ caseId, transitionCode: 'crear_revision' });

    // rol invalido: consultor y mipyme no clasifican (solo advisory)
    await expectRejected(
      () => callerFor(consultor).cases.transition({ caseId, transitionCode: 'clasificar' }),
      'FORBIDDEN',
    );
    await expectRejected(
      () => callerFor(mipyme).cases.transition({ caseId, transitionCode: 'clasificar' }),
      'FORBIDDEN',
    );
  });

  it('assigneMustAct: solo el consultor ASIGNADO opera la propuesta', async () => {
    await callerFor(advisory).cases.transition({ caseId, transitionCode: 'clasificar' });
    await callerFor(advisory).cases.transition({ caseId, transitionCode: 'publicar_bolsa' });
    await callerFor(consultor).postulations.postular({ caseId });
    await callerFor(advisory).cases.assign({ caseId, consultorId: consultor.id });

    // otro consultor del rol, pero NO el asignado: rechazado por la guarda
    await expectRejected(
      () => callerFor(consultor2).cases.transition({ caseId, transitionCode: 'iniciar_diseno' }),
      'FORBIDDEN',
    );
    // advisory no inicia diseno (rol no permitido en la transicion)
    await expectRejected(
      () => callerFor(advisory).cases.transition({ caseId, transitionCode: 'iniciar_diseno' }),
      'FORBIDDEN',
    );
    // version obsoleta en la guarda de inicio
    const { version } = await stateOf(caseId);
    await expectRejected(
      () =>
        callerFor(consultor).cases.transition({
          caseId,
          transitionCode: 'iniciar_diseno',
          expectedVersion: version - 1,
        }),
      'CONFLICT',
    );

    // el asignado SI puede iniciar y continuar el diseno
    await callerFor(consultor).cases.transition({ caseId, transitionCode: 'iniciar_diseno' });
    await expectRejected(
      () => callerFor(consultor2).cases.transition({ caseId, transitionCode: 'propuesta_lista_qa' }),
      'FORBIDDEN',
    );
    await callerFor(consultor).cases.transition({ caseId, transitionCode: 'propuesta_lista_qa' });
    expect((await stateOf(caseId)).currentState.code).toBe('PROPUESTA_LISTA_QA');
  });

  it('companyOwnerMustAct: la empresa NO duena no decide sobre el caso ajeno', async () => {
    const created = await callerFor(advisory).cases.create({
      companyId: foodTechCompanyId,
      data: {
        titulo: 'F2 negativas propiedad',
        area: 'finanzas',
        urgencia: 'media',
        descripcion: 'Caso ajeno: la mipyme no puede decidir por el propietario.',
      },
    });
    const ownerCase = created.id;

    const t = async (actor: TestUser, transitionCode: string) => {
      await callerFor(actor).cases.transition({ caseId: ownerCase, transitionCode });
    };

    await t(advisory, 'crear_revision');
    await t(advisory, 'clasificar');
    await t(advisory, 'publicar_bolsa');
    await callerFor(consultor).postulations.postular({ caseId: ownerCase });
    await callerFor(advisory).cases.assign({ caseId: ownerCase, consultorId: consultor.id });
    await t(consultor, 'iniciar_diseno');
    await t(consultor, 'propuesta_lista_qa');
    await t(advisory, 'autorizar_envio_propuesta');
    await t(advisory, 'abrir_periodo_decision');

    const est = await stateOf(ownerCase);
    expect(est.currentState.code).toBe('EN_DECISION_CLIENTE');

    // advisory no puede aceptar la propuesta (rol: solo la mipyme acepta)...
    await expectRejected(
      () => callerFor(advisory).cases.transition({ caseId: ownerCase, transitionCode: 'aceptar_propuesta' }),
      'FORBIDDEN',
    );
    // ...y la mipyme de OTRA empresa tampoco (guarda companyOwnerMustAct)
    await expectRejected(
      () => callerFor(mipyme).cases.transition({ caseId: ownerCase, transitionCode: 'solicitar_ajustes' }),
      'FORBIDDEN',
    );
    await expectRejected(
      () => callerFor(mipyme).cases.transition({ caseId: ownerCase, transitionCode: 'aceptar_propuesta' }),
      'FORBIDDEN',
    );
    // cierre del caso ajeno tambien bloqueado para la mipyme no duena
    await expectRejected(
      () => callerFor(mipyme).cases.transition({ caseId: ownerCase, transitionCode: 'cerrar_sin_contratacion' }),
      'FORBIDDEN',
    );
  });
});