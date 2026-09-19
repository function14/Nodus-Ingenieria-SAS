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

let advisory: TestUser;
let consultorF4: TestUser;
let tenantId: string;
let mipyme: TestUser;

// Casos de prueba en EN_POSTULACION (creados con su area y complejidad).
let caseFinanzasMedia: string;
let caseFinanzasAlta: string;
let caseLegalAlta: string;
let caseEnRevision: string;

async function createEnPostulacion(area: string, complejidad: string): Promise<string> {
  const created = await callerFor(advisory).cases.create({
    companyId: mipyme.companyId!,
    data: {
      titulo: `F4 ${area} ${complejidad}`,
      area,
      complejidad,
      urgencia: 'media',
      descripcion: 'Caso creado por el test de integracion F4 para la bolsa.',
    },
  });
  for (const code of ['crear_revision', 'clasificar', 'publicar_bolsa']) {
    await callerFor(advisory).cases.transition({ caseId: created.id, transitionCode: code });
  }
  return created.id;
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
  mipyme = await load('mipyme');

  // Protagonista del test: Diana (consultor2@demo.nodus), la consultora que la
  // semilla deja en 'registrado'. Reusar la fila sembrada evita crear usuarios
  // que ensucien los `load('consultor')` de los demas archivos de la suite.
  const u2 = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id, role: { code: 'consultor' }, email: 'consultor2@demo.nodus' },
  });
  consultorF4 = {
    id: u2.id,
    role: 'consultor',
    tenantId: u2.tenantId,
    companyId: u2.companyId,
    name: u2.name,
    email: u2.email,
  };

  // Ficha en estado base por corrida: 'registrado', sin experiencia declarada.
  const consultant =
    (await prisma.consultant.findUnique({ where: { userId: u2.id } })) ??
    (await prisma.consultant.create({
      data: {
        tenantId: tenant.id,
        userId: u2.id,
        humanId: 'CON-990002',
        specialtyCodes: [],
        availability: 'disponible',
        status: 'registrado',
      },
    }));
  await prisma.consultant.update({
    where: { id: consultant.id },
    data: { status: 'registrado', specialtyCodes: [], levelCode: null, availability: 'disponible', enabledAt: null },
  });

  // En antesala (no se tocan en los asserts): docs/authz ya corrieron antes
  // (los archivos corren en orden alfabetico y f4 cierra la suite).
  caseFinanzasMedia = await createEnPostulacion('finanzas', 'media');
  caseFinanzasAlta = await createEnPostulacion('finanzas', 'alta');
  caseLegalAlta = await createEnPostulacion('legal', 'alta');

  // Caso para la aclaracion estructurada: se deja en EN_REVISION.
  const creado = await callerFor(advisory).cases.create({
    companyId: mipyme.companyId!,
    data: {
      titulo: 'F4 solicitud de aclaracion',
      area: 'finanzas',
      complejidad: 'media',
      urgencia: 'media',
      descripcion: 'Caso para probar T3A (RF-035) con aclaraciones estructuradas.',
    },
  });
  await callerFor(advisory).cases.transition({ caseId: creado.id, transitionCode: 'crear_revision' });
  caseEnRevision = creado.id;
});

describe('F4 - guarda de habilitacion en la bolsa (RF-027/028)', () => {
  it('un consultor REGISTRADO abre la bolsa y ve CERO casos', async () => {
    const bolsa = await callerFor(consultorF4).postulations.bolsa();
    expect(bolsa).toHaveLength(0);
  });

  it('RF-030: el consultor registra sus especialidades, nivel y disponibilidad', async () => {
    const perfil = await callerFor(consultorF4).consultants.updateMyProfile({
      specialtyCodes: ['finanzas', 'operaciones'],
      levelCode: 'semi-senior',
      availability: 'disponible',
    });
    expect(perfil.specialtyCodes).toContain('finanzas');
    expect(perfil.levelCode).toBe('semi-senior');
    expect(perfil.status).toBe('registrado');

    const log = await prisma.auditLog.findFirst({
      where: { tenantId, entityType: 'Consultant', action: 'CONSULTOR_PERFIL_ACTUALIZADO' },
      orderBy: { seq: 'desc' },
    });
    expect(log).toBeTruthy();
  });

  it('el ciclo de estado NO salta etapas: registrado -> habilitado es FORBIDDEN', async () => {
    await expect(
      callerFor(advisory).consultants.setStatus({ userId: consultorF4.id, status: 'habilitado' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await callerFor(advisory).consultants.setStatus({ userId: consultorF4.id, status: 'en_validacion' });
    await callerFor(advisory).consultants.setStatus({ userId: consultorF4.id, status: 'habilitado' });

    const row = await prisma.consultant.findUniqueOrThrow({ where: { userId: consultorF4.id } });
    expect(row.status).toBe('habilitado');
    expect(row.enabledAt).toBeTruthy();
  });

  it('habilitado ve solo los casos de su especialidad y nivel', async () => {
    const bolsa = await callerFor(consultorF4).postulations.bolsa();
    const ids = bolsa.map((c) => c.id);
    expect(ids).toContain(caseFinanzasMedia);
    // No: area legal (no es su especialidad) | complejidad alta (> semi-senior)
    expect(ids).not.toContain(caseLegalAlta);
    expect(ids).not.toContain(caseFinanzasAlta);
  });
});

describe('F4 - postular verifica la habilitacion antes de aceptar', () => {
  it('no habilitado -> FORBIDDEN; habilitado -> postula a su nicho', async () => {
    await expect(
      callerFor(consultorF4).postulations.postular({ caseId: caseFinanzasMedia }),
    ).resolves.toBeTruthy();

    await expect(
      callerFor(consultorF4).postulations.postular({ caseId: caseLegalAlta }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      callerFor(consultorF4).postulations.postular({ caseId: caseFinanzasAlta }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Duplicados siguen protegiendos por la unique del modelo
    await expect(
      callerFor(consultorF4).postulations.postular({ caseId: caseFinanzasMedia }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('F4 - solicitud de aclaracion estructurada (RF-035 / T3A)', () => {
  it('pide la aclaracion, guarda la submission y regresa el caso a la empresa', async () => {
    const res = await callerFor(advisory).cases.requestClarification({
      caseId: caseEnRevision,
      items: [
        { campo: 'titulo', solicitud: 'Necesitamos el detalle del objetivo del caso' },
        { solicitud: 'Adjunte el soporte del area solicitada' },
      ],
    });
    expect(res.result.to).toBe('CREADO');
    expect(res.items).toHaveLength(2);

    const submission = await prisma.formSubmission.findUniqueOrThrow({
      where: { id: res.submissionId },
      include: { templateVersion: { include: { template: true } } },
    });
    expect(submission.templateVersion.template.code).toBe('T3A');
    expect((submission.data as { items: unknown[] }).items).toHaveLength(2);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, caseId: caseEnRevision, action: 'ACLARACION_SOLICITADA' },
    });
    expect(audit).toBeTruthy();
    expect(audit!.fromState).toBe('EN_REVISION');
    expect(audit!.toState).toBe('CREADO');

    // La comunicacion gobernada llega a la empresa con la solicitud renderizada
    const notice = await prisma.notification.findFirst({
      where: { tenantId, caseId: caseEnRevision, templateCode: 'TCOM2' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notice).toBeTruthy();
    expect(notice!.message).toContain('Necesitamos el detalle del objetivo del caso');
  });

  it('rechaza items mal formados', async () => {
    await expect(
      callerFor(advisory).cases.requestClarification({
        caseId: caseEnRevision,
        items: [{ solicitud: 'corto' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('solo PMO/Admin piden aclaraciones', async () => {
    await expect(
      callerFor(consultorF4).cases.requestClarification({
        caseId: caseEnRevision,
        items: [{ solicitud: 'Solicitud invalida desde consultor' }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('la bitacora del tenant sigue siendo una cadena valida', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { seq: 'asc' },
    });
    expect(logs.length).toBeGreaterThan(0);
    let prev: string | null = null;
    for (const log of logs) {
      expect(log.prevHash).toBe(prev);
      prev = log.rowHash;
    }
  });
});