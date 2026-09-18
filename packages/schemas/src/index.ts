import { z } from 'zod';

/** Estados del caso (deben coincidir con los CaseState sembrados en la DB). */
export const caseStatusSchema = z.enum([
  'CREADO',
  'EN_REVISION',
  'CLASIFICADO',
  'EN_POSTULACION',
  'ASIGNADO',
  'PROPUESTA_EN_DISENO',
  'PROPUESTA_LISTA_QA',
  'PROPUESTA_ENVIADA',
  'EN_DECISION_CLIENTE',
  'AJUSTES_DE_PROPUESTA',
  'PROPUESTA_ACEPTADA',
  'PENDIENTE_CONTRATACION',
  'AUTORIZADO_EJECUCION',
  'EN_EJECUCION',
  'LISTO_PARA_CIERRE',
  'CERRADO_SIN_CONTRATACION',
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

/** Tipos de documento del repositorio (F3). kind como LOV, no como enum. */
export const documentKindSchema = z.enum(['anexo', 'entregable', 'evidencia']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** Subida de un documento (F3). Re-subir el mismo kind+title => version v+1. */
export const documentUploadInputSchema = z.object({
  caseId: z.string().min(1),
  kind: documentKindSchema,
  title: z.string().min(1).max(200),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'checksum debe ser sha256 hex'),
  filename: z.string().min(1).max(255),
});
export type DocumentUploadInput = z.infer<typeof documentUploadInputSchema>;

/** Pedir la URL firmada de descarga (F3). version opcional -> ultima. */
export const documentDownloadInputSchema = z.object({
  caseId: z.string().min(1),
  documentId: z.string().min(1),
  version: z.number().int().positive().optional(),
});
export type DocumentDownloadInput = z.infer<typeof documentDownloadInputSchema>;
