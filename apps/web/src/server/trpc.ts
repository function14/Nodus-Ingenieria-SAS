import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { canAccess, canPerform, type Action, type Resource } from '@nodus/rbac';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

/**
 * Guard de RECURSO (lectura). La decision NO vive aqui: se delega a
 * @nodus/rbac, que es la unica fuente de verdad. Este wrapper solo traduce
 * la negativa al error de transporte.
 */
export const resourceProcedure = (resource: Resource) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!canAccess(ctx.user, resource)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu rol no tiene acceso a ' + resource });
    }
    return next();
  });

/** Guard de ACCION (mutacion). Misma delegacion a @nodus/rbac. */
export const actionProcedure = (action: Action) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!canPerform(ctx.user, action)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu rol no puede ejecutar ' + action });
    }
    return next();
  });
