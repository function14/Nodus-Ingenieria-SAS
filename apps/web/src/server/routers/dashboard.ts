import { protectedProcedure, router } from '../trpc';

// Proyeccion del Command Center PMO calculada desde Postgres (no mock).
export const dashboardRouter = router({
  pmo: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const [states, cases, timers] = await Promise.all([
      ctx.prisma.caseState.findMany({ orderBy: { order: 'asc' } }),
      ctx.prisma.case.findMany({
        where: { tenantId },
        include: { currentState: true, company: true, assignedUser: true },
      }),
      ctx.prisma.slaTimer.findMany({
        where: { status: { in: ['RUNNING', 'WARN', 'BREACHED'] }, case: { tenantId } },
        include: { rule: true, case: { include: { currentState: true } } },
      }),
    ]);

    const now = Date.now();

    // KPIs
    const total = cases.length;
    const cerrados = cases.filter((c) => c.currentState.isTerminal).length;
    const activos = total - cerrados;
    const criticos = timers.filter((t) => now >= t.dueAt.getTime()).length;
    const conversion = total > 0 ? Math.round((cerrados / total) * 100) : 0;
    const kpis = [
      { label: 'Casos activos', value: activos, delta: total + ' en total' },
      { label: 'SLA criticos', value: criticos, delta: criticos > 0 ? 'Requieren accion' : 'Sin vencidos' },
      { label: 'Conversion', value: conversion + '%', delta: cerrados + ' cerrados' },
      { label: 'Cerrados', value: cerrados, delta: 'de ' + total },
    ];

    // Pipeline por estado (kanban)
    const pipeline = states.map((s) => ({
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

    // Funnel: acumulado por orden (pipeline lineal -> un caso en estado N alcanzo 1..N)
    const funnel = states.map((s) => ({
      stage: s.name,
      value: cases.filter((c) => c.currentState.order >= s.order).length,
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
});
