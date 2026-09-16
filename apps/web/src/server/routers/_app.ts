import { router } from '../trpc';
import { casesRouter } from './cases';
import { auditRouter } from './audit';
import { notificationsRouter } from './notifications';
import { templatesRouter } from './templates';
import { companiesRouter } from './companies';
import { postulationsRouter } from './postulations';
import { dashboardRouter } from './dashboard';
import { slaRouter } from './sla';
import { workflowRouter } from './workflow';

export const appRouter = router({
  cases: casesRouter,
  audit: auditRouter,
  notifications: notificationsRouter,
  templates: templatesRouter,
  companies: companiesRouter,
  postulations: postulationsRouter,
  dashboard: dashboardRouter,
  sla: slaRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;
