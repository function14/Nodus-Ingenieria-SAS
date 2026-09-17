import { actionProcedure, resourceProcedure, router } from '../trpc';

export const companiesRouter = router({
  // Selector minimo para abrir un caso: solo roles que pueden crear casos
  // (si no, seria un canal lateral para saltarse el masking de empresa).
  list: actionProcedure('case.create').query(async ({ ctx }) => {
    return ctx.prisma.company.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }),

  // Directorio completo de empresas: recurso de PMO/Admin.
  overview: resourceProcedure('companyDirectory').query(async ({ ctx }) => {
    const rows = await ctx.prisma.company.findMany({
      where: { tenantId: ctx.user.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { cases: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      emailDomain: c.emailDomain,
      casos: c._count.cases,
    }));
  }),
});
