import { sweepSla } from '@nodus/workflow';
import { actionProcedure, router } from '../trpc';

export const slaRouter = router({
  sweep: actionProcedure('sla.sweep').mutation(async ({ ctx }) => {
    return sweepSla(ctx.user.tenantId);
  }),
});
