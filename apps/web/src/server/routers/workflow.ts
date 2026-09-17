import { resourceProcedure, router } from '../trpc';

// Expone la maquina de estados (workflow as data) para el visor.
export const workflowRouter = router({
  graph: resourceProcedure('workflowDefinition').query(async ({ ctx }) => {
    const [states, transitions] = await Promise.all([
      ctx.prisma.caseState.findMany({ orderBy: { order: 'asc' } }),
      ctx.prisma.caseTransition.findMany({ include: { fromState: true, toState: true } }),
    ]);
    return {
      states: states.map((s) => ({
        code: s.code,
        name: s.name,
        color: s.color,
        order: s.order,
        isInitial: s.isInitial,
        isTerminal: s.isTerminal,
      })),
      transitions: transitions.map((t) => ({
        code: t.code,
        name: t.name,
        from: t.fromState.code,
        to: t.toState.code,
        allowedRoles: t.allowedRoles,
      })),
    };
  }),
});
