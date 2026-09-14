import { router } from '../trpc';
import { casesRouter } from './cases';

export const appRouter = router({
  cases: casesRouter,
});

export type AppRouter = typeof appRouter;
