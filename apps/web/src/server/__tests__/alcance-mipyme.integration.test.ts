import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@nodus/db';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

/**
 * Alcance de la mipyme sobre los casos.
 *
 * Esta fuga existió y pasó build verde, suite verde y una auditoría: el masking
 * (`applyCaseMask`) oculta la identidad del cliente AL CONSULTOR, y de ahí se
 * dedujo que el resto de roles ya estaba resuelto. Pero el masking decide qué
 * CAMPOS se ocultan, no qué FILAS se devuelven. Para la mipyme no había nada
 * que enmascarar — y tampoco nada que filtrar: `cases.list` consultaba por
 * `tenantId` a secas, así que recibía los casos de todas las empresas del
 * tenant con título y nombre reales, y `cases.byId` le abría el expediente
 * completo de cualquiera, bitácora incluida.
 *
 * Se prueba por los cuatro caminos que tocan un caso ajeno, porque cerrar uno
 * solo da una falsa sensación de arreglo.
 */
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

let mipyme: TestUser;
let advisory: TestUser;
let casoAjeno: { id: string; companyId: string };
let empresaAjena: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
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
  [mipyme, advisory] = await Promise.all([load('mipyme'), load('advisory')]);

  const ajeno = await prisma.case.findFirstOrThrow({
    where: { tenantId: tenant.id, companyId: { not: mipyme.companyId! } },
    select: { id: true, companyId: true },
  });
  casoAjeno = { id: ajeno.id, companyId: ajeno.companyId };
  empresaAjena = ajeno.companyId;
});

describe('MIP1 — la lista solo trae los casos de su empresa', () => {
  it('ningún caso devuelto es de otra empresa', async () => {
    const propios = await callerFor(mipyme).cases.list({});
    expect(propios.length).toBeGreaterThan(0);

    const ids = propios.map((c) => c.id);
    const fuera = await prisma.case.count({
      where: { id: { in: ids }, companyId: { not: mipyme.companyId! } },
    });
    expect(fuera).toBe(0);
  });

  it('y trae MENOS que el total del tenant, o la prueba no probaría nada', async () => {
    const propios = await callerFor(mipyme).cases.list({});
    const todos = await callerFor(advisory).cases.list({});
    expect(todos.length).toBeGreaterThan(propios.length);
  });

  it('el filtro por estado no reabre el alcance', async () => {
    // El esquema de entrada acepta el enum de estados, no un string libre.
    const propios = await callerFor(mipyme).cases.list({ stateCode: 'CREADO' });
    const ids = propios.map((c) => c.id);
    if (ids.length > 0) {
      const fuera = await prisma.case.count({
        where: { id: { in: ids }, companyId: { not: mipyme.companyId! } },
      });
      expect(fuera).toBe(0);
    }
  });
});

describe('MIP2 — el expediente ajeno no se abre', () => {
  it('byId de un caso de otra empresa responde NOT_FOUND', async () => {
    await expect(callerFor(mipyme).cases.byId({ id: casoAjeno.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('NOT_FOUND y no FORBIDDEN: el código no debe confirmar que existe', async () => {
    // Advisory sí lo abre, así que el caso existe de verdad y el NOT_FOUND
    // anterior es una negativa deliberada, no un id inventado.
    const visto = await callerFor(advisory).cases.byId({ id: casoAjeno.id });
    expect(visto.id).toBe(casoAjeno.id);
  });

  it('el propio expediente sí se abre', async () => {
    const propio = await prisma.case.findFirstOrThrow({
      where: { companyId: mipyme.companyId! },
      select: { id: true },
    });
    await expect(callerFor(mipyme).cases.byId({ id: propio.id })).resolves.toMatchObject({
      id: propio.id,
    });
  });
});

describe('MIP3 — las acciones disponibles de un caso ajeno tampoco', () => {
  it('availableTransitions de un caso ajeno responde NOT_FOUND', async () => {
    await expect(
      callerFor(mipyme).cases.availableTransitions({ caseId: casoAjeno.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('MIP4 — no puede abrir casos a nombre de otra empresa', () => {
  it('create con el companyId de otra empresa se rechaza', async () => {
    await expect(
      callerFor(mipyme).cases.create({
        companyId: empresaAjena,
        data: {
          titulo: 'Caso suplantando a otra empresa',
          area: 'finanzas',
          complejidad: 'media',
          urgencia: 'media',
          descripcion: 'Intento de apertura por cuenta ajena desde el test de alcance.',
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('y el caso NO quedó creado', async () => {
    const colados = await prisma.case.count({
      where: { companyId: empresaAjena, title: 'Caso suplantando a otra empresa' },
    });
    expect(colados).toBe(0);
  });

  it('con su propia empresa sí puede', async () => {
    const creado = await callerFor(mipyme).cases.create({
      companyId: mipyme.companyId!,
      data: {
        titulo: `Caso propio ${Date.now().toString(36)}`,
        area: 'finanzas',
        complejidad: 'media',
        urgencia: 'media',
        descripcion: 'Apertura legítima por la propia empresa desde el test de alcance.',
      },
    });
    expect(creado.id).toBeTruthy();
  });
});
