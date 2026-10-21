import { applyCaseMask, caseReadScope } from '@nodus/rbac';
import { resourceProcedure, router } from '../trpc';

/**
 * Fases del flujo, para presentar el pipeline sin 17 columnas.
 *
 * No son una invencion de la UI: son las familias de color que el seed ya
 * asigna a los estados ("Admision pizarra, Mercado teal, Propuesta indigo,
 * Contratacion violeta, Ejecucion ambar, Terminales verde/gris"), que a su vez
 * siguen los 9 puntos del encargo. Aqui solo se nombran y se agrupan.
 *
 * Se derivan de `order` y no de un color: agrupar por hex ataria la lectura del
 * tablero a una decision estetica. Si en el futuro las fases tienen que ser
 * gobernables desde /admin, su sitio es una columna en CaseState, no esta
 * constante — queda dicho.
 */
const FASES = [
  { code: 'admision', name: 'Admisión', upTo: 3, color: '#3F4F63' },
  { code: 'mercado', name: 'Bolsa interna', upTo: 5, color: '#0B6560' },
  { code: 'propuesta', name: 'Propuesta', upTo: 10, color: '#3B32A6' },
  { code: 'contratacion', name: 'Contratación', upTo: 13, color: '#6E3BD1' },
  { code: 'ejecucion', name: 'Ejecución', upTo: 15, color: '#8A5A06' },
  { code: 'cierre', name: 'Cerrados', upTo: 99, color: '#15803D' },
] as const;

function faseDe(order: number) {
  return FASES.find((f) => order <= f.upTo) ?? FASES[FASES.length - 1];
}

// Proyeccion del Command Center PMO calculada desde Postgres (no mock).
export const dashboardRouter = router({
  pmo: resourceProcedure('pmoDashboard').query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const [states, cases, timers, entradas] = await Promise.all([
      ctx.prisma.caseState.findMany({ orderBy: { order: 'asc' } }),
      ctx.prisma.case.findMany({
        where: { tenantId },
        include: { currentState: true, company: true, assignedUser: true },
      }),
      ctx.prisma.slaTimer.findMany({
        where: { status: { in: ['RUNNING', 'WARN', 'BREACHED'] }, case: { tenantId } },
        include: { rule: true, case: { include: { currentState: true } } },
      }),
      /**
       * Cada ENTRADA de un caso en un estado, según la bitácora.
       *
       * `CASO_CREADO` ya registra `toState = CREADO`, así que la creación y las
       * transiciones se tratan igual y el estado inicial no necesita un caso
       * aparte.
       *
       * El filtro por `entityType` NO es decorativo: `CONSULTOR_ESTADO` y
       * `ACLARACION_SOLICITADA` también escriben `toState`, sobre un Consultant
       * y un FormSubmission. Sin este filtro, un cambio de estado de un
       * consultor contaría como un caso avanzando de etapa.
       *
       * El `groupBy` por (estado, caso) deja que Postgres haga la deduplicación:
       * un caso que pasó dos veces por «Propuesta enviada» —porque volvió por
       * ajustes— cuenta una sola vez, y además no nos traemos la bitácora
       * entera, que crece sin techo.
       */
      ctx.prisma.auditLog.groupBy({
        by: ['toState', 'entityId'],
        where: {
          tenantId,
          entityType: 'Case',
          action: { in: ['CASO_CREADO', 'CASO_TRANSICION'] },
          toState: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const now = Date.now();

    // KPIs
    const total = cases.length;
    const cerrados = cases.filter((c) => c.currentState.isTerminal).length;
    const activos = total - cerrados;
    /**
     * «Conversión» contaba como convertido TODO estado terminal, y uno de los
     * dos terminales es «Cerrado sin contratación»: el negocio que se pierde.
     * Un panel que suma las derrotas a la tasa de éxito no es un panel.
     *
     * `ESTADO_EXITO` es la única pieza de este cálculo que no sale del dato, y
     * su sitio propio sería una marca en CaseState (`isSuccess`), junto a
     * `isTerminal`, para que Administración pudiera declarar qué cierre cuenta
     * como ganado sin tocar código. No se añade aquí porque exige migración;
     * queda señalado para no fingir que está resuelto.
     */
    const ESTADO_EXITO = 'CERRADO';
    const ganados = cases.filter((c) => c.currentState.code === ESTADO_EXITO).length;
    const perdidos = cerrados - ganados;
    const criticos = timers.filter((t) => now >= t.dueAt.getTime()).length;
    const conversion = total > 0 ? Math.round((ganados / total) * 100) : 0;
    /**
     * `key` existe para que la UI pueda darle a cada KPI su icono sin adivinar
     * por el texto de la etiqueta, y `tono` para que el único KPI accionable
     * —los SLA vencidos— no se vea igual que el contexto. El tono lo decide el
     * servidor porque depende del dato, no del gusto de la pantalla.
     */
    const kpis = [
      { key: 'activos', label: 'Casos activos', value: activos, delta: total + ' en total', tono: 'neutral' as const },
      {
        key: 'sla',
        label: 'SLA críticos',
        value: criticos,
        delta: criticos > 0 ? 'Requieren acción' : 'Sin vencidos',
        tono: criticos > 0 ? ('alerta' as const) : ('neutral' as const),
      },
      {
        key: 'conversion',
        label: 'Conversión',
        value: conversion + '%',
        delta: ganados + ' ganados de ' + total,
        tono: 'neutral' as const,
      },
      {
        key: 'cerrados',
        label: 'Cerrados',
        value: cerrados,
        // Se desglosa a propósito: «cerrados» mezcla dos finales opuestos y el
        // KPI de al lado ahora solo cuenta uno.
        delta: perdidos > 0 ? perdidos + ' sin contratación' : 'todos con contratación',
        tono: 'neutral' as const,
      },
    ];

    // Pipeline agrupado por fase: 6 columnas legibles en vez de 17, sin perder
    // el detalle por estado, que va dentro de cada columna.
    const pipeline = FASES.map((f) => {
      const etapas = states
        .filter((s) => faseDe(s.order).code === f.code)
        .map((s) => ({
          status: s.code,
          name: s.name,
          color: s.color,
          cards: cases
            .filter((c) => c.currentStateId === s.id)
            .map((c) => ({
              id: c.id,
              humanId: c.humanId,
              company: c.company.name,
              assignee: c.assignedUser?.name ?? null,
            })),
        }));
      return {
        code: f.code,
        name: f.name,
        color: f.color,
        total: etapas.reduce((n, e) => n + e.cards.length, 0),
        etapas,
      };
    });

    /**
     * Embudo: cuántos casos ENTRARON de verdad en cada etapa, según la bitácora.
     *
     * Antes se infería del ordinal del estado actual (`currentState.order >=
     * s.order`), con el supuesto de que el flujo es una línea recta. No lo es, y
     * el atajo mentía en los dos sentidos:
     *
     * - Hacia arriba: «Cerrado sin contratación» tiene orden 16, así que un caso
     *   que se perdió en la decisión del cliente se contaba como si hubiera
     *   pasado por «En ejecución» (14) y «Listo para cierre» (15). El embudo
     *   inflaba justo las etapas que importa medir.
     * - Hacia abajo: un caso devuelto por «Ajustes de propuesta» (10) a
     *   «Propuesta enviada» (8) baja de ordinal, y perdía las etapas que sí
     *   había alcanzado.
     *
     * La bitácora no infiere: registra cada entrada en cada estado, está
     * encadenada por hash y es el sistema de registro del producto. Si el
     * embudo es el número que mira un PMO para decidir, tiene que salir de la
     * misma evidencia que se audita.
     *
     * Se cruza con los casos vivos para no contar filas de casos que ya no
     * existen: la bitácora es append-only y sobrevive a lo que registra.
     */
    const idsVivos = new Set(cases.map((c) => c.id));
    const alcanzaron = new Map<string, number>();
    for (const fila of entradas) {
      if (!fila.toState || !idsVivos.has(fila.entityId)) continue;
      alcanzaron.set(fila.toState, (alcanzaron.get(fila.toState) ?? 0) + 1);
    }
    const funnel = states.map((s) => ({
      stage: s.name,
      value: alcanzaron.get(s.code) ?? 0,
    }));

    // SLA heatmap + radial timers
    const byStage = new Map<string, { stage: string; ok: number; warn: number; critical: number }>();
    for (const s of states) byStage.set(s.code, { stage: s.name, ok: 0, warn: 0, critical: 0 });
    const radial: { label: string; pct: number; color: string }[] = [];
    for (const t of timers) {
      const start = t.startedAt.getTime();
      const due = t.dueAt.getTime();
      const totalMs = Math.max(due - start, 1);
      const pct = Math.round(((now - start) / totalMs) * 100);
      let health: 'ok' | 'warn' | 'critical' = 'ok';
      if (now >= due) health = 'critical';
      else if (pct >= t.rule.warnPct) health = 'warn';
      const bucket = byStage.get(t.case.currentState.code);
      if (bucket) bucket[health] += 1;
      radial.push({
        label: t.case.humanId,
        pct,
        color: health === 'critical' ? '#DC2626' : health === 'warn' ? '#CA8A04' : '#16A34A',
      });
    }
    const slaByStage = [...byStage.values()].filter((b) => b.ok + b.warn + b.critical > 0);
    const radialTimers = radial.sort((a, b) => b.pct - a.pct).slice(0, 4);

    return { kpis, pipeline, funnel, slaByStage, radialTimers };
  }),

  /**
   * Workbench del consultor.
   *
   * El encargo lo describe como «bolsa interna como deck de tarjetas con badges
   * de elegibilidad y postulación en 1 clic». La bolsa ya existe y se consume
   * tal cual desde `postulations.bolsa` —no se duplica aquí, porque duplicar la
   * consulta duplicaría el filtro de elegibilidad y es así como dos vistas
   * acaban discrepando—. Esta proyección aporta lo que faltaba: qué tiene este
   * consultor entre manos y qué espera algo de él.
   */
  consultor: resourceProcedure('consultorWorkbench').query(async ({ ctx }) => {
    const [asignados, postulaciones, transiciones] = await Promise.all([
      ctx.prisma.case.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          assignedUserId: ctx.user.id,
          currentState: { isTerminal: false },
        },
        include: { company: true, currentState: true, slaTimers: { include: { rule: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      ctx.prisma.postulation.findMany({
        where: { tenantId: ctx.user.tenantId, consultorId: ctx.user.id },
        include: { case: { include: { currentState: true, company: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      ctx.prisma.caseTransition.findMany({ include: { toState: true } }),
    ]);

    /**
     * Acciones que le toca ejecutar al consultor en SUS casos.
     *
     * Basta filtrar por `allowedRoles` porque la consulta ya se limitó a los
     * casos asignados a él, que es justo lo que exige la guarda
     * `assigneeMustAct`. Si algún día esta lista incluyera casos ajenos, habría
     * que evaluar las guardas de verdad — queda dicho aquí para que el supuesto
     * no se pierda.
     */
    const accionesDe = (currentStateId: string) =>
      transiciones
        .filter((t) => t.fromStateId === currentStateId && t.allowedRoles.includes(ctx.user.role))
        .map((t) => ({ code: t.code, name: t.name, to: t.toState.name }));

    const now = Date.now();
    const misCasos = asignados.map((c) => {
      const activo = c.slaTimers.find((t) => t.status !== 'DONE' && t.status !== 'STOPPED');
      const sla = activo
        ? (() => {
            const total = Math.max(activo.dueAt.getTime() - activo.startedAt.getTime(), 1);
            const pct = Math.round(((now - activo.startedAt.getTime()) / total) * 100);
            const vencido = now >= activo.dueAt.getTime();
            return {
              pct: Math.min(pct, 200),
              vencido,
              enRiesgo: !vencido && pct >= activo.rule.warnPct,
              dueAt: activo.dueAt,
            };
          })()
        : null;
      return {
        id: c.id,
        humanId: c.humanId,
        title: c.title,
        company: c.company.name,
        state: { code: c.currentState.code, name: c.currentState.name, color: c.currentState.color },
        acciones: accionesDe(c.currentStateId),
        sla,
      };
    });

    return {
      misCasos,
      // Los casos asignados ya NO se enmascaran (es la regla de D9: el masking
      // cae con la asignación), pero los de una postulación todavía pendiente
      // sí, porque aún no se los han dado.
      postulaciones: postulaciones.map((p) => {
        const view = applyCaseMask(ctx.user, p.case, {
          title: p.case.title,
          company: p.case.company.name,
        });
        return {
          id: p.id,
          caseId: p.caseId,
          humanId: p.case.humanId,
          title: view.title,
          company: view.company,
          masked: view.masked,
          status: p.status,
          state: p.case.currentState.name,
          createdAt: p.createdAt,
        };
      }),
      resumen: {
        asignados: misCasos.length,
        pendientesDeMi: misCasos.filter((c) => c.acciones.length > 0).length,
        enRiesgo: misCasos.filter((c) => c.sla?.enRiesgo || c.sla?.vencido).length,
        postulacionesAbiertas: postulaciones.filter((p) => p.status === 'PENDIENTE').length,
      },
    };
  }),

  /**
   * Portal de la mipyme.
   *
   * El encargo lo describe como «expediente como timeline vivo, asistente paso
   * a paso con ring de progreso y tarjetas de decisión grandes». El progreso se
   * calcula sobre el maestro de estados —no sobre un número fijo— para que
   * añadir una etapa desde /admin no deje el anillo mintiendo.
   *
   * El alcance sale de `caseReadScope`: su empresa y nada más.
   */
  mipyme: resourceProcedure('mipymePortal').query(async ({ ctx }) => {
    const scope = caseReadScope(ctx.user);
    if (scope.kind !== 'company' || scope.companyId === null) {
      return { misCasos: [], resumen: { total: 0, activos: 0, decisionesPendientes: 0, cerrados: 0 } };
    }

    const [casos, estados, transiciones] = await Promise.all([
      ctx.prisma.case.findMany({
        where: { tenantId: ctx.user.tenantId, companyId: scope.companyId },
        include: { currentState: true, assignedUser: true },
        orderBy: { updatedAt: 'desc' },
      }),
      ctx.prisma.caseState.findMany({ orderBy: { order: 'asc' } }),
      ctx.prisma.caseTransition.findMany({ include: { toState: true } }),
    ]);

    // Denominador del anillo: el último estado NO terminal del maestro. Contar
    // los terminales inflaría el progreso de todo caso en curso.
    const ultimoEnCurso = Math.max(
      ...estados.filter((s) => !s.isTerminal).map((s) => s.order),
      1,
    );

    const misCasos = casos.map((c) => {
      // Igual que en el workbench: la consulta ya se limitó a los casos de su
      // empresa, que es lo que pide la guarda `companyOwnerMustAct`.
      const decisiones = transiciones
        .filter(
          (t) => t.fromStateId === c.currentStateId && t.allowedRoles.includes(ctx.user.role),
        )
        .map((t) => ({ code: t.code, name: t.name, to: t.toState.name }));

      return {
        id: c.id,
        humanId: c.humanId,
        title: c.title,
        state: { code: c.currentState.code, name: c.currentState.name, color: c.currentState.color },
        terminal: c.currentState.isTerminal,
        progresoPct: c.currentState.isTerminal
          ? 100
          : Math.round((c.currentState.order / ultimoEnCurso) * 100),
        etapa: c.currentState.order,
        etapas: ultimoEnCurso,
        consultor: c.assignedUser?.name ?? null,
        decisiones,
        updatedAt: c.updatedAt,
      };
    });

    return {
      misCasos,
      resumen: {
        total: misCasos.length,
        activos: misCasos.filter((c) => !c.terminal).length,
        decisionesPendientes: misCasos.filter((c) => c.decisiones.length > 0).length,
        cerrados: misCasos.filter((c) => c.terminal).length,
      },
    };
  }),
});
