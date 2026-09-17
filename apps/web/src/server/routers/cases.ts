import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { computeRowHash } from '@nodus/db';
import { validateSubmission } from '@nodus/forms';
import { applyCaseMask } from '@nodus/rbac';
import { caseByIdInputSchema, caseListInputSchema } from '@nodus/schemas';
import { executeTransition, processOutbox, WorkflowError } from '@nodus/workflow';
import { actionProcedure, resourceProcedure, router } from '../trpc';

const workflowCodeToTrpc: Record<
  string,
  'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST'
> = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  BAD_TRANSITION: 'BAD_REQUEST',
  INVALID_STATE: 'BAD_REQUEST',
  VERSION_CONFLICT: 'CONFLICT',
};

export const casesRouter = router({
  list: resourceProcedure('cases')
    .input(caseListInputSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.case.findMany({
        where: {
          tenantId: ctx.user.tenantId,
          ...(input?.stateCode ? { currentState: { code: input.stateCode } } : {}),
        },
        include: { company: true, currentState: true, assignedUser: true },
        orderBy: { updatedAt: 'desc' },
      });
      // El masking lo decide @nodus/rbac (misma regla que el detalle).
      return rows.map((c) => {
        const view = applyCaseMask(ctx.user, c, { title: c.title, company: c.company.name });
        return {
          id: c.id,
          humanId: c.humanId,
          title: view.title,
          company: view.company,
          state: {
            code: c.currentState.code,
            name: c.currentState.name,
            color: c.currentState.color,
          },
          assignee: c.assignedUser?.name ?? null,
          updatedAt: c.updatedAt,
          masked: view.masked,
        };
      });
    }),

  byId: resourceProcedure('cases')
    .input(caseByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const c = await ctx.prisma.case.findFirst({
        where: { id: input.id, tenantId: ctx.user.tenantId },
        include: {
          company: true,
          currentState: true,
          assignedUser: true,
          auditLogs: { orderBy: { seq: 'asc' }, include: { actor: true } },
          submissions: {
            orderBy: { createdAt: 'desc' },
            include: { templateVersion: { include: { template: true } } },
          },
        },
      });
      if (!c) throw new TRPCError({ code: 'NOT_FOUND' });

      // MISMA regla de masking que la lista (fuente unica: @nodus/rbac).
      const view = applyCaseMask(ctx.user, c, { title: c.title, company: c.company.name });
      return {
        ...c,
        title: view.title,
        company: { ...c.company, name: view.company },
        masked: view.masked,
        // Canales laterales: si el caso esta enmascarado no se entregan los datos
        // del cliente por la submission ni por el payload de la bitacora.
        submissions: view.masked ? [] : c.submissions,
        auditLogs: view.masked
          ? c.auditLogs.map((log) => ({ ...log, payload: {} }))
          : c.auditLogs,
      };
    }),

  availableTransitions: resourceProcedure('cases')
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const c = await ctx.prisma.case.findFirst({
        where: { id: input.caseId, tenantId: ctx.user.tenantId },
        select: { currentStateId: true },
      });
      if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
      const transitions = await ctx.prisma.caseTransition.findMany({
        where: { fromStateId: c.currentStateId },
        include: { toState: true },
      });
      // Autorizacion data-driven: la fuente es CaseTransition.allowedRoles.
      return transitions
        .filter((t) => t.allowedRoles.includes(ctx.user.role))
        .map((t) => ({ code: t.code, name: t.name, to: t.toState.name }));
    }),

  transition: resourceProcedure('cases')
    .input(
      z.object({
        caseId: z.string().min(1),
        transitionCode: z.string().min(1),
        expectedVersion: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executeTransition({
          caseId: input.caseId,
          transitionCode: input.transitionCode,
          actor: { id: ctx.user.id, role: ctx.user.role, tenantId: ctx.user.tenantId },
          expectedVersion: input.expectedVersion,
        });
        await processOutbox(ctx.user.tenantId);
        return result;
      } catch (e) {
        if (e instanceof WorkflowError) {
          throw new TRPCError({ code: workflowCodeToTrpc[e.code] ?? 'BAD_REQUEST', message: e.message });
        }
        throw e;
      }
    }),

  assign: actionProcedure('case.assign')
    .input(z.object({ caseId: z.string().min(1), consultorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.prisma.case.findFirst({
        where: { id: input.caseId, tenantId: ctx.user.tenantId },
        include: { currentState: true },
      });
      if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
      if (c.currentState.code !== 'CLASIFICADO') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El caso no esta listo para asignar (CLASIFICADO)' });
      }
      const post = await ctx.prisma.postulation.findUnique({
        where: { caseId_consultorId: { caseId: input.caseId, consultorId: input.consultorId } },
      });
      if (!post) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ese consultor no se postulo a este caso' });

      await ctx.prisma.$transaction([
        ctx.prisma.case.update({ where: { id: input.caseId }, data: { assignedUserId: input.consultorId } }),
        ctx.prisma.postulation.update({ where: { id: post.id }, data: { status: 'ASIGNADO' } }),
        ctx.prisma.postulation.updateMany({
          where: { caseId: input.caseId, id: { not: post.id } },
          data: { status: 'RECHAZADO' },
        }),
      ]);

      try {
        const result = await executeTransition({
          caseId: input.caseId,
          transitionCode: 'asignar',
          actor: { id: ctx.user.id, role: ctx.user.role, tenantId: ctx.user.tenantId },
        });
        await processOutbox(ctx.user.tenantId);
        return result;
      } catch (e) {
        if (e instanceof WorkflowError) {
          throw new TRPCError({ code: workflowCodeToTrpc[e.code] ?? 'BAD_REQUEST', message: e.message });
        }
        throw e;
      }
    }),

  // Apertura del caso (T1) - Forms-as-Data: valida contra el JSON Schema, crea el
  // caso en el estado inicial + submission versionada + bitacora genesis encadenada.
  create: actionProcedure('case.create')
    .input(
      z.object({
        companyId: z.string().min(1),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tv = await ctx.prisma.templateVersion.findFirst({
        where: { template: { code: 'T1' }, isActive: true },
        orderBy: { version: 'desc' },
      });
      if (!tv) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Plantilla T1 no encontrada' });

      const check = validateSubmission(tv.jsonSchema, input.data);
      if (!check.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: check.errors.join('; ') });
      }

      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, tenantId: ctx.user.tenantId },
        select: { id: true },
      });
      if (!company) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Empresa invalida' });

      const initial = await ctx.prisma.caseState.findFirst({ where: { isInitial: true } });
      if (!initial) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sin estado inicial' });

      const result = await ctx.prisma.$transaction(async (tx) => {
        const last = await tx.case.findFirst({
          where: { tenantId: ctx.user.tenantId },
          orderBy: { humanId: 'desc' },
          select: { humanId: true },
        });
        const lastNum = last ? parseInt(last.humanId.split('-').pop() ?? '0', 10) : 0;
        const humanId = `NOD-2026-${String(lastNum + 1).padStart(3, '0')}`;
        const titulo = typeof input.data.titulo === 'string' ? input.data.titulo : humanId;

        const created = await tx.case.create({
          data: {
            tenantId: ctx.user.tenantId,
            humanId,
            title: titulo,
            companyId: input.companyId,
            currentStateId: initial.id,
          },
        });

        await tx.formSubmission.create({
          data: {
            templateVersionId: tv.id,
            caseId: created.id,
            version: 1,
            data: input.data as object,
            submittedById: ctx.user.id,
          },
        });

        const lastLog = await tx.auditLog.findFirst({
          where: { tenantId: ctx.user.tenantId },
          orderBy: { seq: 'desc' },
          select: { seq: true, rowHash: true },
        });
        const seq = (lastLog?.seq ?? 0) + 1;
        const rec = {
          seq,
          action: 'CASO_CREADO',
          entityType: 'Case',
          entityId: created.id,
          fromState: null as string | null,
          toState: initial.code,
          payload: { humanId, template: 'T1' } as unknown,
        };
        const rowHash = computeRowHash(lastLog?.rowHash ?? null, rec);
        await tx.auditLog.create({
          data: {
            tenantId: ctx.user.tenantId,
            seq,
            caseId: created.id,
            actorId: ctx.user.id,
            action: rec.action,
            entityType: rec.entityType,
            entityId: rec.entityId,
            fromState: rec.fromState,
            toState: rec.toState,
            payload: rec.payload as object,
            prevHash: lastLog?.rowHash ?? null,
            rowHash,
          },
        });

        await tx.domainEvent.create({
          data: {
            tenantId: ctx.user.tenantId,
            type: 'CASE_CREATED',
            payload: { caseId: created.id, humanId, to: initial.code },
          },
        });

        return { id: created.id, humanId };
      });

      await processOutbox(ctx.user.tenantId);
      return result;
    }),
});
