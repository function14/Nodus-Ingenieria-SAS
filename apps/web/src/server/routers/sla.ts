import { TRPCError } from '@trpc/server';
import { sweepSla } from '@nodus/workflow';
import { protectedProcedure, router } from '../trpc';

export const slaRouter = router({
  sweep: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== 'advisory' && ctx.user.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo PMO/Admin puede correr el barrido SLA' });
    }
    return sweepSla(ctx.user.tenantId);
  }),
});
