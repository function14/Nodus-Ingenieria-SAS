import { z } from 'zod';

/** Estados del caso (deben coincidir con los CaseState sembrados en la DB). */
export const caseStatusSchema = z.enum([
  'CREADO',
  'EN_REVISION',
  'CLASIFICADO',
  'ASIGNADO',
  'EN_EJECUCION',
  'CERRADO',
]);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** Item de la lista de casos que expone la API a la UI. */
export const caseListItemSchema = z.object({
  id: z.string(),
  humanId: z.string(),
  title: z.string(),
  company: z.string(),
  state: z.object({
    code: z.string(),
    name: z.string(),
    color: z.string().nullable(),
  }),
  assignee: z.string().nullable(),
  updatedAt: z.date(),
});
export type CaseListItem = z.infer<typeof caseListItemSchema>;

/** Inputs de los procedimientos tRPC de casos. */
export const caseListInputSchema = z
  .object({
    stateCode: caseStatusSchema.optional(),
  })
  .optional();
export type CaseListInput = z.infer<typeof caseListInputSchema>;

export const caseByIdInputSchema = z.object({
  id: z.string().min(1),
});
export type CaseByIdInput = z.infer<typeof caseByIdInputSchema>;

/** Credenciales de login (validadas en el authorize de Auth.js). */
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type Credentials = z.infer<typeof credentialsSchema>;
