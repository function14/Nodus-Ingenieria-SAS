import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@nodus/db';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

/**
 * El embudo del dashboard PMO.
 *
 * Antes se infería del ordinal del estado actual (`currentState.order >=
 * s.order`), dando por hecho que el flujo es una linea recta. No lo es, y el
 * atajo mentia en los dos sentidos. Estas pruebas fijan exactamente esos dos
 * modos de fallo, porque son los que un refactor futuro puede reintroducir sin
 * que nada mas se queje:
 *
 *  - un cierre SIN contratacion (orden 16) se contaba como si hubiera pasado
 *    por ejecucion (14) y cierre (15), que nunca toco;
 *  - un caso devuelto por ajustes (10) a propuesta enviada (8) perdia las
 *    etapas que SI habia alcanzado.
 *
 * Y una tercera, que no es del ordinal sino de la consulta nueva: la bitacora
 * guarda `toState` tambien para CONSULTOR_ESTADO, asi que sin filtrar por
 * entityType un cambio de estado de un consultor inflaria el embudo.
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
let consultor: TestUser;
let mipyme: TestUser;
/** Nombre visible de cada estado, para leer el embudo por codigo. */
let nombreDe: Map<string, string>;

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
  [advisory, consultor, mipyme] = await Promise.all([
    load('advisory'),
    load('consultor'),
    load('mipyme'),
  ]);
  const estados = await prisma.caseState.findMany();
  nombreDe = new Map(estados.map((s) => [s.code, s.name]));
});

/** El embudo como mapa codigo -> valor. */
async function embudo(): Promise<Map<string, number>> {
  const d = await callerFor(advisory).dashboard.pmo();
  const porNombre = new Map(d.funnel.map((f) => [f.stage, f.value]));
  const out = new Map<string, number>();
  for (const [code, name] of nombreDe) out.set(code, porNombre.get(name) ?? 0);
  return out;
}

async function kpis() {
  const d = await callerFor(advisory).dashboard.pmo();
  return new Map(d.kpis.map((k) => [k.key, k]));
}

/** Crea un caso de la empresa de la mipyme y lo deja en EN_DECISION_CLIENTE. */
async function hastaDecisionCliente(etiqueta: string): Promise<string> {
  const creado = await callerFor(advisory).cases.create({
    companyId: mipyme.companyId!,
    data: {
      titulo: `Embudo ${etiqueta} ${Date.now().toString(36)}`,
      area: 'finanzas',
      complejidad: 'media',
      urgencia: 'media',
      descripcion: 'Caso creado por el test del embudo para recorrer el flujo real.',
    },
  });
  const caseId = creado.id;
  await callerFor(advisory).cases.transition({ caseId, transitionCode: 'crear_revision' });
  await callerFor(advisory).cases.transition({ caseId, transitionCode: 'clasificar' });
  await callerFor(advisory).cases.transition({ caseId, transitionCode: 'publicar_bolsa' });
  await callerFor(consultor).postulations.postular({ caseId, note: 'Me interesa.' });
  await callerFor(advisory).cases.assign({ caseId, consultorId: consultor.id });
  await callerFor(consultor).cases.transition({ caseId, transitionCode: 'iniciar_diseno' });
  await callerFor(consultor).cases.transition({ caseId, transitionCode: 'propuesta_lista_qa' });
  await callerFor(advisory).cases.transition({
    caseId,
    transitionCode: 'autorizar_envio_propuesta',
  });
  await callerFor(advisory).cases.transition({ caseId, transitionCode: 'abrir_periodo_decision' });
  return caseId;
}

describe('EMB1 - un cierre sin contratacion no inventa etapas', () => {
  it('no suma a ejecucion ni a listo para cierre, aunque su orden sea mayor', async () => {
    const antes = await embudo();

    const caseId = await hastaDecisionCliente('perdido');
    await callerFor(mipyme).cases.transition({ caseId, transitionCode: 'cerrar_sin_contratacion' });
    const estado = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { currentState: true },
    });
    expect(estado.currentState.code).toBe('CERRADO_SIN_CONTRATACION');

    const despues = await embudo();
    const delta = (code: string) => (despues.get(code) ?? 0) - (antes.get(code) ?? 0);

    // Lo que SI recorrio.
    expect(delta('CREADO')).toBe(1);
    expect(delta('EN_DECISION_CLIENTE')).toBe(1);
    expect(delta('CERRADO_SIN_CONTRATACION')).toBe(1);

    // Lo que NO. Con el calculo por ordinal estos tres habrian subido, porque
    // CERRADO_SIN_CONTRATACION es orden 16 y estos son 14, 15 y 17.
    expect(delta('EN_EJECUCION')).toBe(0);
    expect(delta('LISTO_PARA_CIERRE')).toBe(0);
    expect(delta('CERRADO')).toBe(0);
    // Tampoco paso por la rama de aceptacion ni por contratacion.
    expect(delta('PROPUESTA_ACEPTADA')).toBe(0);
    expect(delta('PENDIENTE_CONTRATACION')).toBe(0);
  });

  it('y no cuenta como conversion', async () => {
    const antes = await kpis();
    const ganadosAntes = Number(String(antes.get('conversion')?.delta ?? '0').split(' ')[0]);
    const cerradosAntes = Number(antes.get('cerrados')?.value ?? 0);

    const caseId = await hastaDecisionCliente('no-convierte');
    await callerFor(mipyme).cases.transition({ caseId, transitionCode: 'cerrar_sin_contratacion' });

    const despues = await kpis();
    const ganadosDespues = Number(String(despues.get('conversion')?.delta ?? '0').split(' ')[0]);
    const cerradosDespues = Number(despues.get('cerrados')?.value ?? 0);

    // Cerro, pero se perdio: sube "cerrados" y NO sube "ganados".
    expect(cerradosDespues).toBe(cerradosAntes + 1);
    expect(ganadosDespues).toBe(ganadosAntes);
  });
});

describe('EMB2 - un caso que vuelve por ajustes conserva lo alcanzado', () => {
  it('cuenta las etapas que alcanzo, y cada una una sola vez', async () => {
    const antes = await embudo();

    const caseId = await hastaDecisionCliente('bucle');
    // Vuelve atras: EN_DECISION_CLIENTE (9) -> AJUSTES (10) -> PROPUESTA_ENVIADA (8).
    await callerFor(mipyme).cases.transition({ caseId, transitionCode: 'solicitar_ajustes' });
    await callerFor(consultor).cases.transition({ caseId, transitionCode: 'reenviar_propuesta' });

    const estado = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { currentState: true },
    });
    expect(estado.currentState.code).toBe('PROPUESTA_ENVIADA');

    const despues = await embudo();
    const delta = (code: string) => (despues.get(code) ?? 0) - (antes.get(code) ?? 0);

    // Entro DOS veces en propuesta enviada; cuenta una. La deduplicacion la
    // hace el groupBy por (estado, caso), no un filtro en memoria.
    expect(delta('PROPUESTA_ENVIADA')).toBe(1);

    // Con el calculo por ordinal estas dos habrian vuelto a 0 al retroceder el
    // caso al orden 8, borrando etapas que realmente alcanzo.
    expect(delta('EN_DECISION_CLIENTE')).toBe(1);
    expect(delta('AJUSTES_DE_PROPUESTA')).toBe(1);
  });
});

describe('EMB3 - la bitacora de otras entidades no entra en el embudo', () => {
  it('cambiar el estado de un consultor no mueve ninguna etapa', async () => {
    const antes = await embudo();

    // CONSULTOR_ESTADO tambien escribe toState (sobre un Consultant). Si la
    // consulta no filtrara por entityType, esto inflaria una etapa.
    const actual = await prisma.consultant.findUniqueOrThrow({
      where: { userId: consultor.id },
      select: { status: true },
    });
    await callerFor(advisory).consultants.setStatus({
      userId: consultor.id,
      status: 'condicionado',
    });
    await callerFor(advisory).consultants.setStatus({
      userId: consultor.id,
      // Se devuelve a su estado original: el test no deja al consultor tocado
      // para los que corran despues.
      status: actual.status as 'habilitado',
    });

    const despues = await embudo();
    for (const [code, valor] of antes) {
      expect(despues.get(code)).toBe(valor);
    }
  });
});
