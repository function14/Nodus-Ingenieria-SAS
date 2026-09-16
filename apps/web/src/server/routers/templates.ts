import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

export const templatesRouter = router({
  getActive: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tv = await ctx.prisma.templateVersion.findFirst({
        where: { template: { code: input.code }, isActive: true },
        orderBy: { version: 'desc' },
        include: { template: true },
      });
      if (!tv) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        code: tv.template.code,
        name: tv.template.name,
        version: tv.version,
        jsonSchema: tv.jsonSchema,
        uiSchema: tv.uiSchema,
      };
    }),
});
