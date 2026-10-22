import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@nodus/db';
import { aplicarFiltroCasos, leerFiltroCasos } from '@/lib/filtro-casos';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

/**
 * Equivalencia KPI -> destino.
 *
 * Los cuatro bloques de cifras de cada panel son enlaces a `/casos` con un
 * filtro en la URL. El contrato que sostiene esa navegacion no es que el
 * enlace exista, es que el numero y la lista COINCIDAN: un KPI que dice 10 y
 * te deja en una lista de 14 no es un detalle estetico, es el panel
 * desmintiendose a si mismo, y nadie vuelve a creerle.
 *
 * Por eso se prueba el circuito entero y no el predicado suelto: se llama al
 * mismo procedure que consume la lista, se le aplica el mismo filtro que la
 * pagina, y se compara contra la misma proyeccion que pinta el KPI. Asi, si
 * alguien cambia que es un estado terminal, o de quien es un caso, falla aqui
 * antes de llegar a pantalla.
 *
 * Cada aserto se condiciona a que el seed tenga el caso: con `expect(n)` sobre
 * un conjunto vacio el test pasaria sin haber comprobado nada.
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

/** Lee el filtro tal como lo haria la pagina a partir de la query del enlace. */
function filtroDe(query: string) {
  return leerFiltroCasos(new URLSearchParams(query));
}

let advisory: TestUser;
let consultor: TestUser;
let mipyme: TestUser;
/** Caso prestado a otro consultor para que `mio` tenga algo que discriminar. */
let ajeno: { id: string; duenoOriginal: string | null } | null = null;

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
  const load = async (roleCode: string, salto = 0): Promise<TestUser> => {
    const [u] = await prisma.user.findMany({
      where: { tenantId: tenant.id, role: { code: roleCode } },
      orderBy: { createdAt: 'asc' },
      skip: salto,
      take: 1,
    });
    if (!u) throw new Error(`El seed no tiene un ${roleCode} en la posicion ${salto}`);
    return {
      id: u.id,
      role: roleCode,
      tenantId: u.tenantId,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
    };
  };
  let otroConsultor: TestUser;
  [advisory, consultor, mipyme, otroConsultor] = await Promise.all([
    load('advisory'),
    load('consultor'),
    load('mipyme'),
    load('consultor', 1),
  ]);

  /**
   * El seed asigna TODOS los casos al primer consultor, asi que sobre ese dato
   * «es mio» y «tiene responsable» son indistinguibles: un `mio` mal calculado
   * —derivado de que haya responsable, o de comparar nombres— pasaria el test
   * sin que nadie se enterase. Comprobado: con `mio: assignedUser !== null` los
   * nueve asertos seguian en verde.
   *
   * Asi que el test se fabrica la unica fila que falta y la devuelve a su sitio
   * al terminar. Se toca `assignedUserId` a pelo, sin pasar por la transicion
   * de asignacion, porque aqui no se esta probando el motor: se esta montando
   * un escenario donde la pregunta «de quien es esto» tenga dos respuestas.
   */
  const prestado = await prisma.case.findFirst({
    where: { tenantId: tenant.id, assignedUserId: consultor.id },
    orderBy: { createdAt: 'asc' },
  });
  if (prestado) {
    ajeno = { id: prestado.id, duenoOriginal: prestado.assignedUserId };
    await prisma.case.update({
      where: { id: prestado.id },
      data: { assignedUserId: otroConsultor.id },
    });
  }
});

afterAll(async () => {
  // La bitacora es append-only y el resto de la suite comparte esta base: lo
  // prestado se devuelve, pase lo que pase con los asertos.
  if (ajeno) {
    await prisma.case.update({
      where: { id: ajeno.id },
      data: { assignedUserId: ajeno.duenoOriginal },
    });
  }
});

describe('la lista de casos expone lo que el filtro necesita', () => {
  it('cada caso dice si su estado es final y si es del usuario', async () => {
    const casos = await callerFor(advisory).cases.list();
    expect(casos.length).toBeGreaterThan(0);
    for (const c of casos) {
      expect(typeof c.state.isTerminal).toBe('boolean');
      expect(typeof c.mio).toBe('boolean');
    }
  });

  it('no decide en el cliente que estado es final: lo contrasta con el workflow', async () => {
    const casos = await callerFor(advisory).cases.list();
    const terminales = new Set(
      (await prisma.caseState.findMany({ where: { isTerminal: true } })).map((s) => s.code),
    );
    expect(terminales.size).toBeGreaterThan(0);
    for (const c of casos) {
      expect(c.state.isTerminal).toBe(terminales.has(c.state.code));
    }
  });

  it('abiertos y cerrados parten la lista sin solaparse ni perder casos', async () => {
    const casos = await callerFor(advisory).cases.list();
    const abiertos = aplicarFiltroCasos(casos, filtroDe('cierre=abiertos'));
    const cerrados = aplicarFiltroCasos(casos, filtroDe('cierre=cerrados'));
    expect(abiertos.length + cerrados.length).toBe(casos.length);
    expect(abiertos.every((c) => !c.state.isTerminal)).toBe(true);
    expect(cerrados.every((c) => c.state.isTerminal)).toBe(true);
  });

  it('ignora un filtro inventado en vez de quedarse sin lista', async () => {
    const casos = await callerFor(advisory).cases.list();
    expect(aplicarFiltroCasos(casos, filtroDe('cierre=lo-que-sea')).length).toBe(casos.length);
    expect(aplicarFiltroCasos(casos, filtroDe('responsable=nadie')).length).toBe(casos.length);
  });
});

describe('cada KPI lleva a la lista que cuenta', () => {
  it('PMO: «Casos activos» y «Cerrados» cuadran con su destino', async () => {
    const caller = callerFor(advisory);
    const [panel, casos] = await Promise.all([caller.dashboard.pmo(), caller.cases.list()]);
    const kpi = (key: string) => panel.kpis.find((k) => k.key === key)?.value;

    expect(kpi('activos')).toBe(aplicarFiltroCasos(casos, filtroDe('cierre=abiertos')).length);
    expect(kpi('cerrados')).toBe(aplicarFiltroCasos(casos, filtroDe('cierre=cerrados')).length);
  });

  it('Consultor: «Casos asignados» cuadra con responsable=mi&cierre=abiertos', async () => {
    const caller = callerFor(consultor);
    const [panel, casos] = await Promise.all([caller.dashboard.consultor(), caller.cases.list()]);
    const destino = aplicarFiltroCasos(casos, filtroDe('responsable=mi&cierre=abiertos'));

    expect(panel.resumen.asignados).toBeGreaterThan(0); // el seed le asigna casos
    expect(destino.length).toBe(panel.resumen.asignados);
    expect(destino.every((c) => c.mio && !c.state.isTerminal)).toBe(true);
  });

  it('Consultor: «mio» es suyo por id, no «tiene responsable»', async () => {
    const casos = await callerFor(consultor).cases.list();
    const suyos = await prisma.case.findMany({
      where: { tenantId: consultor.tenantId, assignedUserId: consultor.id },
      select: { id: true },
    });
    expect(suyos.length).toBeGreaterThan(0);
    const esperados = new Set(suyos.map((c) => c.id));
    for (const c of casos) {
      expect(c.mio).toBe(esperados.has(c.id));
    }

    // El caso prestado a otro consultor: tiene responsable y NO es suyo. Sin
    // esta fila los dos filtros serian el mismo y el test no probaria nada.
    const prestado = casos.find((c) => c.id === ajeno?.id);
    expect(prestado).toBeDefined();
    expect(prestado?.assignee).not.toBeNull();
    expect(prestado?.mio).toBe(false);

    const deOtro = aplicarFiltroCasos(casos, filtroDe('responsable=asignado')).length;
    const mios = aplicarFiltroCasos(casos, filtroDe('responsable=mi')).length;
    expect(deOtro).toBeGreaterThan(mios);
  });

  it('Mipyme: «Casos abiertos», «Cerrados» y «Con consultor» cuadran con su destino', async () => {
    const caller = callerFor(mipyme);
    const [panel, casos] = await Promise.all([caller.dashboard.mipyme(), caller.cases.list()]);

    expect(casos.length).toBeGreaterThan(0); // su empresa tiene casos sembrados
    expect(aplicarFiltroCasos(casos, filtroDe('cierre=abiertos')).length).toBe(
      panel.resumen.activos,
    );
    expect(aplicarFiltroCasos(casos, filtroDe('cierre=cerrados')).length).toBe(
      panel.resumen.cerrados,
    );
    expect(aplicarFiltroCasos(casos, filtroDe('responsable=asignado')).length).toBe(
      panel.misCasos.filter((c) => c.consultor !== null).length,
    );
  });

  it('el filtro no amplia el alcance: la mipyme sigue viendo solo lo suyo', async () => {
    const casos = await callerFor(mipyme).cases.list();
    const filtrados = aplicarFiltroCasos(casos, filtroDe('responsable=sin-asignar'));
    const idsPropios = new Set(
      (
        await prisma.case.findMany({
          where: { tenantId: mipyme.tenantId, companyId: mipyme.companyId ?? '' },
          select: { id: true },
        })
      ).map((c) => c.id),
    );
    expect(filtrados.every((c) => idsPropios.has(c.id))).toBe(true);
  });
});
