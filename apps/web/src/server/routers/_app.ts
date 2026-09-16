import { router } from '../trpc';
import { casesRouter } from './cases';
import { auditRouter } from './audit';
import { notificationsRouter } from './notifications';
import { templatesRouter } from './templates';
import { companiesRouter } from './companies';
import { postulationsRouter } from './postulations';

export const appRouter = router({
  cases: casesRouter,
  audit: auditRouter,
  notifications: notificationsRouter,
  templates: templatesRouter,
  companies: companiesRouter,
  postulations: postulationsRouter,
});

export type AppRouter = typeof appRouter;
