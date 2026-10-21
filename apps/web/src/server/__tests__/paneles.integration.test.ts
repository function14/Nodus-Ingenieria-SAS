import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@nodus/db';
import { allowedRoutes, MASKED_COMPANY } from '@nodus/rbac';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

/**
 * Los tres paneles de `/`.
 *
 * La ruta es una sola y el contenido son tres proyecciones distintas, asi que
 * lo que hay que probar no es que cada panel cargue, sino que NINGUN rol pueda
 * leer el panel de otro. Compartir URL sin compartir dato es justo donde una
 * vista "solo de presentacion" se convierte en una fuga.
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

let advisory: TestUser;
let admin: TestUser;
let consultor: TestUser;
let mipyme: TestUser;

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
  [advisory, admin, consultor, mipyme] = await Promise.all([
    load('advisory'),
    load('admin'),
    load('consultor'),
    load('mipyme'),
  ]);
});

describe('PAN1 - cada rol tiene casa, y solo la suya', () => {
  it('los cuatro roles pueden entrar a /', () => {
    for (const role of ['advisory', 'admin', 'consultor', 'mipyme']) {
      expect(allowedRoutes(role)).toContain('/');
    }
  });

  it('los paneles por rol no anaden enlaces al nav', () => {
    // Son recursos de DATO, con ruta null: protegen una proyeccion sin crear
    // una entrada de menu que no existe.
    const rutas = allowedRoutes('consultor');
    expect(rutas.filter((r) => r === '/').length).toBe(1);
    expect(rutas).not.toContain(null as unknown as string);
  });

  it('advisory y admin leen el Command Center', async () => {
    await expect(callerFor(advisory).dashboard.pmo()).resolves.toBeTruthy();
    await expect(callerFor(admin).dashboard.pmo()).resolves.toBeTruthy();
  });

  it('el consultor NO lee el Command Center ni el Portal', async () => {
    await expect(callerFor(consultor).dashboard.pmo()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(callerFor(consultor).dashboard.mipyme()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('la mipyme NO lee el Command Center ni el Workbench', async () => {
    await expect(callerFor(mipyme).dashboard.pmo()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(callerFor(mipyme).dashboard.consultor()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('advisory tampoco entra a los paneles ajenos, aunque lo vea todo', async () => {
    await expect(callerFor(advisory).dashboard.consultor()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(callerFor(advisory).dashboard.mipyme()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('PAN2 - el Workbench solo trae lo del propio consultor', () => {
  it('todos los casos asignados son suyos y ninguno esta cerrado', async () => {
    const w = await callerFor(consultor).dashboard.consultor();
    const ids = w.misCasos.map((c) => c.id);
    if (ids.length > 0) {
      const ajenos = await prisma.case.count({
        where: { id: { in: ids }, assignedUserId: { not: consultor.id } },
      });
      expect(ajenos).toBe(0);
      const cerrados = await prisma.case.count({
        where: { id: { in: ids }, currentState: { isTerminal: true } },
      });
      expect(cerrados).toBe(0);
    }
  });

  it('un caso asignado muestra la empresa real; una postulacion pendiente no', async () => {
    const w = await callerFor(consultor).dashboard.consultor();
    for (const c of w.misCasos) {
      expect(c.company).not.toBe(MASKED_COMPANY);
    }
    for (const p of w.postulaciones) {
      const kase = await prisma.case.findUniqueOrThrow({
        where: { id: p.caseId },
        select: { assignedUserId: true },
      });
      // La regla de D9: el masking cae con la asignacion, no con la postulacion.
      if (kase.assignedUserId !== consultor.id) {
        expect(p.company).toBe(MASKED_COMPANY);
        expect(p.masked).toBe(true);
      }
    }
  });

  it('las acciones ofrecidas son las que su rol puede ejecutar', async () => {
    const w = await callerFor(consultor).dashboard.consultor();
    for (const c of w.misCasos) {
      for (const a of c.acciones) {
        const t = await prisma.caseTransition.findUniqueOrThrow({ where: { code: a.code } });
        expect(t.allowedRoles).toContain('consultor');
      }
    }
  });
});

describe('PAN3 - el Portal solo trae los casos de su empresa', () => {
  it('ningun caso del portal es de otra empresa', async () => {
    const p = await callerFor(mipyme).dashboard.mipyme();
    expect(p.misCasos.length).toBeGreaterThan(0);
    const ids = p.misCasos.map((c) => c.id);
    const fuera = await prisma.case.count({
      where: { id: { in: ids }, companyId: { not: mipyme.companyId! } },
    });
    expect(fuera).toBe(0);
  });

  it('y trae menos que el total del tenant', async () => {
    const p = await callerFor(mipyme).dashboard.mipyme();
    const total = await prisma.case.count({ where: { tenantId: mipyme.tenantId } });
    expect(p.misCasos.length).toBeLessThan(total);
    expect(p.resumen.total).toBe(p.misCasos.length);
  });

  it('el anillo de progreso nunca pasa de 100 ni se calcula sobre un fijo', async () => {
    const p = await callerFor(mipyme).dashboard.mipyme();
    const enCurso = await prisma.caseState.count({ where: { isTerminal: false } });
    for (const c of p.misCasos) {
      expect(c.progresoPct).toBeGreaterThanOrEqual(0);
      expect(c.progresoPct).toBeLessThanOrEqual(100);
      // El denominador sale del maestro de estados, no de un 17 escrito a mano.
      expect(c.etapas).toBe(enCurso);
      if (c.terminal) expect(c.progresoPct).toBe(100);
    }
  });

  it('las decisiones ofrecidas son ejecutables por mipyme', async () => {
    const p = await callerFor(mipyme).dashboard.mipyme();
    for (const c of p.misCasos) {
      for (const d of c.decisiones) {
        const t = await prisma.caseTransition.findUniqueOrThrow({ where: { code: d.code } });
        expect(t.allowedRoles).toContain('mipyme');
      }
    }
  });
});
