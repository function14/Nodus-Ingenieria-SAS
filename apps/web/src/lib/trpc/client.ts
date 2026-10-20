'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

/**
 * Tipos de las respuestas del router, para que las vistas no tengan que
 * reconstruirlos a mano: `RouterOutputs['cases']['list'][number]`.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
