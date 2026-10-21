import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@nodus/db';
import type { Role } from '@nodus/rbac';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

/**
 * Parametrización (admin de configuración).
 *
 * Lo que de verdad importa probar aquí no es que los formularios guarden, sino
 * las dos afirmaciones de arquitectura que sostiene esta pantalla:
 *
 * 1. **La configuración es gobierno, y el gobierno está acotado a un rol.**
 *    Advisory OPERA el flujo; Administrador DEFINE las reglas. Si advisory
 *    pudiera reescribir sus propios permisos, la matriz RBAC sería decorativa.
 * 2. **El dato manda de verdad.** Quitar un rol de `allowedRoles` tiene que
 *    apagar a la vez el botón (`availableTransitions`) y el motor
 *    (`cases.transition`), porque ambos leen la misma columna. Si solo se
 *    apagara el botón, la autorización sería cosmética.
 *
 * El test deja la base como la encontró: toma una instantánea en `beforeAll` y
 * la restaura en `afterAll`, que corre incluso si una aserción falla. Además
 * las etiquetas de LOV llevan sufijo único, para que la suite pueda correr dos
 * veces seguidas sin volver a sembrar.
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

const SUFIJO = Date.now().toString(36);
const TRANSICION = 'crear_revision';
const ETAPA_SLA = 'CLASIFICADO';

let admin: TestUser;
let advisory: TestUser;
let consultor: TestUser;
let mipyme: TestUser;

let rolesOriginales: Role[];
let slaOriginal: { hours: number; warnPct: number; escalatePct: number; escalateRole: string | null };
const lovCreados: string[] = [];

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
  [admin, advisory, consultor, mipyme] = await Promise.all([
    load('admin'),
    load('advisory'),
    load('consultor'),
    load('mipyme'),
  ]);

  const t = await prisma.caseTransition.findUniqueOrThrow({ where: { code: TRANSICION } });
  rolesOriginales = t.allowedRoles as Role[];
  const r = await prisma.slaRule.findUniqueOrThrow({ where: { stateCode: ETAPA_SLA } });
  slaOriginal = {
    hours: r.hours,
    warnPct: r.warnPct,
    escalatePct: r.escalatePct,
    escalateRole: r.escalateRole,
  };
});

afterAll(async () => {
  await prisma.caseTransition.update({
    where: { code: TRANSICION },
    data: { allowedRoles: rolesOriginales },
  });
  await prisma.slaRule.update({ where: { stateCode: ETAPA_SLA }, data: slaOriginal });
  if (lovCreados.length > 0) {
    await prisma.lovItem.deleteMany({ where: { id: { in: lovCreados } } });
  }
});

/** Caso nuevo: queda en el estado inicial, donde aplica TRANSICION. */
async function casoNuevo(): Promise<string> {
  const creado = await callerFor(advisory).cases.create({
    companyId: mipyme.companyId!,
    data: {
      titulo: `Config ${SUFIJO}`,
      // El formulario valida contra los CÓDIGOS de la LOV, no las etiquetas.
      area: 'finanzas',
      complejidad: 'media',
      urgencia: 'media',
      descripcion: 'Caso creado por el test de integracion del admin de parametrizacion.',
    },
  });
  return creado.id;
}

describe('ADM1 — la configuración está acotada al rol Administrador', () => {
  it('el administrador lee toda la parametrización', async () => {
    const cfg = await callerFor(admin).admin.overview();
    expect(cfg.transiciones.length).toBeGreaterThan(0);
    expect(cfg.sla.length).toBeGreaterThan(0);
    expect(cfg.lov.length).toBeGreaterThan(0);
    expect(cfg.roles).toContain('consultor');
  });

  it('advisory NO entra, aunque opere el flujo y vea la bitácora', async () => {
    await expect(callerFor(advisory).admin.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Control: advisory sí ve la bitácora. El rechazo es de recurso, no de sesión.
    await expect(callerFor(advisory).audit.verifyChain()).resolves.toBeTruthy();
  });

  it('consultor y mipyme tampoco', async () => {
    await expect(callerFor(consultor).admin.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(callerFor(mipyme).admin.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('advisory no puede reescribir sus propios permisos', async () => {
    await expect(
      callerFor(advisory).admin.setTransitionRoles({
        code: TRANSICION,
        allowedRoles: ['advisory', 'consultor'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ADM2 — quitar un rol apaga el botón Y el motor', () => {
  it('la misma columna gobierna la oferta y la ejecución', async () => {
    const caseId = await casoNuevo();

    // Antes: advisory ve la transición y puede ejecutarla.
    const antes = await callerFor(advisory).cases.availableTransitions({ caseId });
    expect(antes.map((t) => t.code)).toContain(TRANSICION);

    // El administrador se la quita.
    const r = await callerFor(admin).admin.setTransitionRoles({
      code: TRANSICION,
      allowedRoles: ['admin'],
    });
    expect(r.allowedRoles).toEqual(['admin']);

    try {
      // Después: desaparece de la oferta...
      const despues = await callerFor(advisory).cases.availableTransitions({ caseId });
      expect(despues.map((t) => t.code)).not.toContain(TRANSICION);

      // ...y el motor la rechaza aunque se invoque a mano. Esto es lo que
      // separa una autorización real de un botón escondido.
      await expect(
        callerFor(advisory).cases.transition({ caseId, transitionCode: TRANSICION }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await callerFor(admin).admin.setTransitionRoles({
        code: TRANSICION,
        allowedRoles: rolesOriginales,
      });
    }

    // Restaurado: vuelve a estar disponible y ejecuta.
    const restaurado = await callerFor(advisory).cases.availableTransitions({ caseId });
    expect(restaurado.map((t) => t.code)).toContain(TRANSICION);
    await expect(
      callerFor(advisory).cases.transition({ caseId, transitionCode: TRANSICION }),
    ).resolves.toBeTruthy();
  });

  it('una transición sin roles se rechaza: sería inalcanzable', async () => {
    await expect(
      callerFor(admin).admin.setTransitionRoles({
        code: TRANSICION,
        allowedRoles: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Y la configuración quedó intacta.
    const t = await prisma.caseTransition.findUniqueOrThrow({ where: { code: TRANSICION } });
    expect(t.allowedRoles).toEqual(rolesOriginales);
  });

  it('una transición inexistente no se inventa', async () => {
    await expect(
      callerFor(admin).admin.setTransitionRoles({ code: 'no_existe', allowedRoles: ['admin'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ADM3 — SLA: los umbrales se validan entre sí', () => {
  it('el aviso no puede llegar después del escalamiento', async () => {
    await expect(
      callerFor(admin).admin.setSlaRule({
        stateCode: ETAPA_SLA,
        hours: 48,
        warnPct: 90,
        escalatePct: 80,
        escalateRole: null,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('un cambio válido persiste y queda escrito', async () => {
    const r = await callerFor(admin).admin.setSlaRule({
      stateCode: ETAPA_SLA,
      hours: 6,
      warnPct: 50,
      escalatePct: 100,
      escalateRole: 'advisory',
    });
    expect(r.hours).toBe(6);
    expect(r.escalateRole).toBe('advisory');

    const cfg = await callerFor(admin).admin.overview();
    const vista = cfg.sla.find((x) => x.stateCode === ETAPA_SLA);
    expect(vista).toMatchObject({ hours: 6, warnPct: 50, escalatePct: 100 });
  });

  it('una etapa sin regla no se crea por la puerta de atrás', async () => {
    await expect(
      callerFor(admin).admin.setSlaRule({
        stateCode: 'ETAPA_QUE_NO_EXISTE',
        hours: 24,
        warnPct: 80,
        escalatePct: 100,
        escalateRole: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ADM4 — listas de valores', () => {
  it('añade un valor, lo publica en la lista y rechaza el duplicado', async () => {
    const label = `Sostenibilidad ${SUFIJO}`;
    const creado = await callerFor(admin).admin.addLovItem({ groupCode: 'areas', label });
    expect(creado.label).toBe(label);
    expect(creado.code).toMatch(/^[a-z0-9_]+$/);

    const item = await prisma.lovItem.findFirstOrThrow({ where: { code: creado.code } });
    lovCreados.push(item.id);

    const cfg = await callerFor(admin).admin.overview();
    const areas = cfg.lov.find((g) => g.code === 'areas');
    expect(areas?.items.map((i) => i.label)).toContain(label);

    // El código se deriva de la etiqueta, así que el duplicado se detecta
    // aunque la etiqueta venga con otra capitalización o acentos.
    await expect(
      callerFor(admin).admin.addLovItem({ groupCode: 'areas', label: label.toUpperCase() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('un grupo inexistente se rechaza', async () => {
    await expect(
      callerFor(admin).admin.addLovItem({ groupCode: 'grupo_fantasma', label: 'X' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('una etiqueta sin letras ni dígitos no produce código válido', async () => {
    await expect(
      callerFor(admin).admin.addLovItem({ groupCode: 'areas', label: '---' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('ADM5 — configurar también se audita', () => {
  it('cada cambio deja fila y la cadena sigue verificando', async () => {
    const antes = await prisma.auditLog.count({
      where: { action: { in: ['CONFIG_TRANSICION', 'CONFIG_SLA', 'CONFIG_LOV'] } },
    });

    await callerFor(admin).admin.setSlaRule({
      stateCode: ETAPA_SLA,
      hours: 7,
      warnPct: 60,
      escalatePct: 110,
      escalateRole: null,
    });

    const despues = await prisma.auditLog.count({
      where: { action: { in: ['CONFIG_TRANSICION', 'CONFIG_SLA', 'CONFIG_LOV'] } },
    });
    expect(despues).toBe(antes + 1);

    const fila = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONFIG_SLA', entityId: ETAPA_SLA },
      orderBy: { seq: 'desc' },
    });
    expect(fila.actorId).toBe(admin.id);
    // El payload guarda el antes y el después: sin eso la bitácora diría que
    // algo cambió, pero no desde qué.
    expect(JSON.stringify(fila.payload)).toMatch(/"de"/);
    expect(JSON.stringify(fila.payload)).toMatch(/"a"/);

    const chain = await callerFor(admin).audit.verifyChain();
    expect(chain.valid).toBe(true);
  });
});
