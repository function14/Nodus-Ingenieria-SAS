import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma, appendAuditRow } from '@nodus/db';
import { canSelfDeclareClassification, canSetConsultantStatus } from '@nodus/rbac';
import {
  consultantClassifySchema,
  consultantProfileSchema,
  consultantStatusSchema,
} from '@nodus/schemas';
import { actionProcedure, resourceProcedure, router } from '../trpc';

/** CON-000001 -> siguiente numero: max(humanId) + 1 por tenant. */
async function nextHumanId(tenantId: string): Promise<string> {
  const last = await prisma.consultant.findFirst({
    where: { tenantId },
    orderBy: { humanId: 'desc' },
    select: { humanId: true },
  });
  const lastNum = last ? parseInt(last.humanId.split('-').pop() ?? '0', 10) : 0;
  return 'CON-' + String(lastNum + 1).padStart(6, '0');
}

export const consultantsRouter = router({
  list: resourceProcedure('consultantDirectory').query(async ({ ctx }) => {
    const rows = await ctx.prisma.user.findMany({
      where: { tenantId: ctx.user.tenantId, role: { code: 'consultor' } },
      include: {
        consultant: true,
        _count: { select: { assignedCases: true, postulations: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      humanId: u.consultant?.humanId ?? null,
      status: u.consultant?.status ?? null,
      level: u.consultant?.levelCode ?? null,
      specialties: u.consultant?.specialtyCodes ?? [],
      availability: u.consultant?.availability ?? null,
      enabledAt: u.consultant?.enabledAt ?? null,
      asignados: u._count.assignedCases,
      postulaciones: u._count.postulations,
    }));
  }),

  my: resourceProcedure('profile').query(async ({ ctx }) => {
    return ctx.prisma.consultant.findUnique({ where: { userId: ctx.user.id } });
  }),

  // RF-030: el consultor registra su disponibilidad y experiencia. Si aun no
  // tiene ficha se crea en estado 'registrado' (lo habilita el flujo despues).
  updateMyProfile: actionProcedure('consultant.profile')
    .input(consultantProfileSchema)
    .mutation(async ({ ctx, input }) => {
      let consultant = await ctx.prisma.consultant.findUnique({
        where: { userId: ctx.user.id },
      });
      if (!consultant) {
        consultant = await ctx.prisma.consultant.create({
          data: {
            tenantId: ctx.user.tenantId,
            userId: ctx.user.id,
            humanId: await nextHumanId(ctx.user.tenantId),
            specialtyCodes: input.specialtyCodes,
            levelCode: input.levelCode,
            availability: input.availability,
          },
        });
      } else if (canSelfDeclareClassification(consultant.status)) {
        // Aun en declaracion (TC1/TC2): puede ajustar su ficha completa.
        consultant = await ctx.prisma.consultant.update({
          where: { id: consultant.id },
          data: {
            specialtyCodes: input.specialtyCodes,
            levelCode: input.levelCode,
            availability: input.availability,
          },
        });
      } else {
        // Ya clasificado: especialidad y nivel son de advisory (TC3). Se
        // rechaza explicitamente en vez de ignorar en silencio.
        const cambiaNivel = input.levelCode !== consultant.levelCode;
        const cambiaEspecialidad =
          input.specialtyCodes.length !== consultant.specialtyCodes.length ||
          input.specialtyCodes.some((c) => !consultant!.specialtyCodes.includes(c));
        if (cambiaNivel || cambiaEspecialidad) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Tu especialidad y nivel los fija Advisory en la clasificación; solo puedes cambiar tu disponibilidad',
          });
        }
        consultant = await ctx.prisma.consultant.update({
          where: { id: consultant.id },
          data: { availability: input.availability },
        });
      }

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONSULTOR_PERFIL_ACTUALIZADO',
        entityType: 'Consultant',
        entityId: consultant.id,
        payload: {
          specialties: input.specialtyCodes,
          level: input.levelCode,
          availability: input.availability,
        },
      });

      return consultant;
    }),

  // Transicion de estado del consultor (workflow-as-data). El transito
  // permitido lo define CONSULTANT_STATUS_TRANSITIONS en @nodus/rbac.
  /**
   * Clasificacion del consultor (TC3, RF-030): especialidad y nivel los fija
   * Advisory, porque alimentan la guarda de elegibilidad de la bolsa.
   */
  classify: actionProcedure('consultant.classify')
    .input(consultantClassifySchema)
    .mutation(async ({ ctx, input }) => {
      const consultant = await ctx.prisma.consultant.findFirst({
        where: { userId: input.userId, tenantId: ctx.user.tenantId },
      });
      if (!consultant) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.prisma.consultant.update({
        where: { id: consultant.id },
        data: { specialtyCodes: input.specialtyCodes, levelCode: input.levelCode },
      });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONSULTOR_CLASIFICADO',
        entityType: 'Consultant',
        entityId: consultant.id,
        payload: {
          de: { especialidades: consultant.specialtyCodes, nivel: consultant.levelCode },
          a: { especialidades: input.specialtyCodes, nivel: input.levelCode },
        },
      });

      return updated;
    }),

  setStatus: actionProcedure('consultant.setStatus')
    .input(z.object({ userId: z.string().min(1), status: consultantStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.user.tenantId },
        include: { consultant: true },
      });
      const consultant = user?.consultant;
      if (!user || !consultant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'El usuario no tiene ficha de consultor' });
      }
      if (!canSetConsultantStatus(consultant.status, input.status)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `No se puede pasar de ${consultant.status} a ${input.status}`,
        });
      }

      const updated = await ctx.prisma.consultant.update({
        where: { id: consultant.id },
        data: {
          status: input.status,
          enabledAt:
            input.status === 'habilitado'
              ? (consultant.enabledAt ?? new Date())
              : consultant.enabledAt,
        },
      });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONSULTOR_ESTADO',
        entityType: 'Consultant',
        entityId: consultant.id,
        fromState: consultant.status,
        toState: input.status,
        payload: { humanId: consultant.humanId },
      });

      return updated;
    }),
});