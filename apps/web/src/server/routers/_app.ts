import { router } from '../trpc';
import { casesRouter } from './cases';
import { auditRouter } from './audit';
import { notificationsRouter } from './notifications';

export const appRouter = router({
  cases: casesRouter,
  audit: auditRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
