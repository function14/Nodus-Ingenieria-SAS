import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { appendAuditRow } from '@nodus/db';
import { notify } from '@nodus/notifications';
import { canAccessCaseDocuments, type Actor } from '@nodus/rbac';
import {
  documentDownloadInputSchema,
  documentUploadInputSchema,
} from '@nodus/schemas';
import { createS3Storage, objectKeyFor, storageConfigFromEnv } from '@nodus/storage';
import { actionProcedure, resourceProcedure, router } from '../trpc';
import type { Context } from '../context';

// El storage se configura por entorno (ver apps/web/.env.example): MinIO en
// local (docker compose) y Cloudflare R2 en produccion, misma interfaz.
const storage = createS3Storage(storageConfigFromEnv());

/** Tipo mínimo del caso que necesita la zona documental. */
type CaseDocRow = {
  id: string;
  humanId: string;
  companyId: string;
  assignedUserId: string | null;
  currentState: { code: string };
  company: { name: string };
};

/** El contexto autenticado (user inyectado por protectedProcedure). */
type AuthedContext = Context & { user: Actor };

async function gateDocumentCase(
  ctx: AuthedContext,
  caseId: string,
): Promise<CaseDocRow> {
  const kase = await ctx.prisma.case.findFirst({
    where: { id: caseId, tenantId: ctx.user.tenantId },
    select: {
      id: true,
      humanId: true,
      companyId: true,
      assignedUserId: true,
      currentState: { select: { code: true } },
      company: { select: { name: true } },
    },
  });
  if (!kase) throw new TRPCError({ code: 'NOT_FOUND' });
  // Autorizacion de la zona documental (RT-022): UNA regla en packages/rbac.
  if (!canAccessCaseDocuments(ctx.user, kase)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tienes acceso a los documentos de este caso',
    });
  }
  return kase;
}

/**
 * Repositorio documental (F3): lista, subida y descarga con PRESIGNED URLs.
 * Reglas:
 *   - El archivo no pasa por el servidor (PUT/GET directo al bucket).
 *   - `DocumentVersion` es append-only: subir de nuevo crea v+1 (RF-041/042).
 *   - Toda subida y toda descarga quedan en la bitacora encadenada.
 *   - El acceso deriva de @nodus/rbac.canAccessCaseDocuments (nada ad-hoc).
 */
export const documentsRouter = router({
  list: resourceProcedure('cases')
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await gateDocumentCase(ctx, input.caseId);
      const docs = await ctx.prisma.document.findMany({
        where: { caseId: input.caseId, tenantId: ctx.user.tenantId },
        include: {
          versions: {
            orderBy: { version: 'asc' },
            include: { uploadedBy: { select: { name: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        stateCode: d.stateCode,
        currentVersion: d.currentVersion,
        versions: d.versions.map((v) => ({
          version: v.version,
          mime: v.mime,
          sizeBytes: v.sizeBytes,
          uploadedAt: v.uploadedAt,
          uploadedByName: v.uploadedBy.name,
        })),
      }));
    }),

  upload: actionProcedure('document.upload')
    .input(documentUploadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const kase = await gateDocumentCase(ctx, input.caseId);
      const title = input.title.trim();

      const created = await ctx.prisma.$transaction(async (tx) => {
        let doc = await tx.document.findUnique({
          where: {
            tenantId_caseId_kind_title: {
              tenantId: ctx.user.tenantId,
              caseId: input.caseId,
              kind: input.kind,
              title,
            },
          },
        });
        const version = (doc?.currentVersion ?? 0) + 1;
        if (doc) {
          doc = await tx.document.update({
            where: { id: doc.id },
            data: {
              stateCode: kase.currentState.code,
              currentVersion: version,
            },
          });
        } else {
          doc = await tx.document.create({
            data: {
              tenantId: ctx.user.tenantId,
              caseId: input.caseId,
              stateCode: kase.currentState.code,
              kind: input.kind,
              title,
              currentVersion: version,
            },
          });
        }

        const objectKey = objectKeyFor({
          companyId: kase.companyId,
          caseId: input.caseId,
          stateCode: kase.currentState.code,
          version,
          filename: input.filename,
        });
        const dv = await tx.documentVersion.create({
          data: {
            documentId: doc.id,
            version,
            objectKey,
            mime: input.mime,
            sizeBytes: input.sizeBytes,
            checksum: input.checksum,
            uploadedById: ctx.user.id,
          },
        });

        await appendAuditRow({
          prisma: tx,
          tenantId: ctx.user.tenantId,
          actorId: ctx.user.id,
          caseId: input.caseId,
          action: 'DOCUMENTO_SUBIDO',
          entityType: 'DocumentVersion',
          entityId: dv.id,
          payload: {
            kind: input.kind,
            title,
            version,
            sizeBytes: input.sizeBytes,
          },
        });

        return { doc, dv };
      });

      const putUrl = await storage.putObjectUrl(created.dv.objectKey);

      // Comunicacion gobernada: un entregable avisa (TCOM11) y los demas
      // documentos se registran (documento_subido). No-op si no hay regla.
      await notify({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        eventType: input.kind === 'entregable' ? 'entregable_cargado' : 'documento_subido',
        caseId: input.caseId,
        actorId: ctx.user.id,
        vars: {
          humanId: kase.humanId,
          empresa: kase.company.name,
          entregable: title,
          version: String(created.dv.version),
        },
      });

      return {
        documentId: created.doc.id,
        version: created.dv.version,
        // El cliente hace el PUT; nunca pasa el archivo por el servidor.
        putUrl,
      };
    }),

  downloadUrl: resourceProcedure('cases')
    .input(documentDownloadInputSchema)
    .mutation(async ({ ctx, input }) => {
      await gateDocumentCase(ctx, input.caseId);
      const dv = await ctx.prisma.documentVersion.findFirst({
        where: {
          document: { id: input.documentId, caseId: input.caseId, tenantId: ctx.user.tenantId },
          ...(input.version ? { version: input.version } : {}),
        },
        orderBy: { version: 'desc' },
      });
      if (!dv) throw new TRPCError({ code: 'NOT_FOUND' });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        caseId: input.caseId,
        action: 'DOCUMENTO_DESCARGADO',
        entityType: 'DocumentVersion',
        entityId: dv.id,
        payload: { documentId: input.documentId, version: dv.version },
      });

      const getUrl = await storage.getObjectUrl(dv.objectKey);
      return { url: getUrl, version: dv.version };
    }),
});