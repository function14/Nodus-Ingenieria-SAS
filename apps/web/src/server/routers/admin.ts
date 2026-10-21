import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { appendAuditRow } from '@nodus/db';
import { ROLES } from '@nodus/rbac';
import { actionProcedure, resourceProcedure, router } from '../trpc';

/**
 * Parametrización del sistema.
 *
 * Es lo que convierte "el workflow es dato" de afirmación en hecho: hasta ahora
 * estados, transiciones, SLA y listas de valores se leían de la base pero solo
 * podían cambiarse volviendo a sembrarla, lo que borra la bitácora. Un dato que
 * nadie puede cambiar sin un despliegue no es parametrizable.
 *
 * Dos reglas gobiernan este router:
 *
 * 1. **Cada cambio se audita.** Configurar es gobierno, y el gobierno de un
 *    sistema de trazabilidad no puede ser lo único sin trazar.
 * 2. **Cada cambio se valida contra el grafo**, no solo contra su propia forma.
 *    Dejar una transición sin roles o un estado sin salida rompe casos que ya
 *    están en curso, y eso no lo detecta un esquema de Zod.
 */
const SLUG = /^[a-z0-9_]+$/;

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const adminRouter = router({
  /** Todo lo parametrizable, en una sola lectura para la pantalla. */
  overview: resourceProcedure('configuration').query(async ({ ctx }) => {
    const [transiciones, sla, grupos] = await Promise.all([
      ctx.prisma.caseTransition.findMany({
        include: { fromState: true, toState: true },
        orderBy: { code: 'asc' },
      }),
      ctx.prisma.slaRule.findMany({ orderBy: { stateCode: 'asc' } }),
      ctx.prisma.lovGroup.findMany({
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { code: 'asc' },
      }),
    ]);

    return {
      roles: [...ROLES],
      transiciones: transiciones.map((t) => ({
        code: t.code,
        name: t.name,
        from: t.fromState.code,
        to: t.toState.code,
        allowedRoles: t.allowedRoles,
      })),
      sla: sla.map((r) => ({
        stateCode: r.stateCode,
        hours: r.hours,
        warnPct: r.warnPct,
        escalatePct: r.escalatePct,
        escalateRole: r.escalateRole,
      })),
      lov: grupos.map((g) => ({
        code: g.code,
        name: g.name,
        items: g.items.map((i) => ({ code: i.code, label: i.label })),
      })),
    };
  }),

  /**
   * Cambia qué roles pueden ejecutar una transición.
   *
   * Es el cambio más demostrativo del sistema: quitar un rol hace desaparecer
   * el botón en la ficha del caso Y hace que el motor rechace la acción, porque
   * ambas cosas leen esta misma columna.
   */
  setTransitionRoles: actionProcedure('config.workflow')
    .input(
      z.object({
        code: z.string().min(1),
        allowedRoles: z.array(z.enum(ROLES)).min(1, 'Una transición sin roles es inalcanzable'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actual = await ctx.prisma.caseTransition.findUnique({
        where: { code: input.code },
        include: { fromState: true, toState: true },
      });
      if (!actual) throw new TRPCError({ code: 'NOT_FOUND' });

      const roles = [...new Set(input.allowedRoles)];
      const actualizada = await ctx.prisma.caseTransition.update({
        where: { code: input.code },
        data: { allowedRoles: roles },
      });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONFIG_TRANSICION',
        entityType: 'CaseTransition',
        entityId: actual.code,
        payload: {
          transicion: `${actual.fromState.code} -> ${actual.toState.code}`,
          de: actual.allowedRoles,
          a: roles,
        },
      });

      return { code: actualizada.code, allowedRoles: actualizada.allowedRoles };
    }),

  /**
   * Ajusta la regla de SLA de una etapa.
   *
   * Matiz operativo que conviene conocer: `hours` se lee AL TRANSICIONAR y queda
   * fijo en el temporizador, mientras que los umbrales se leen EN CADA BARRIDO.
   * Bajar un umbral afecta a los casos ya en curso; cambiar las horas solo a los
   * que empiecen después.
   */
  setSlaRule: actionProcedure('config.sla')
    .input(
      z
        .object({
          stateCode: z.string().min(1),
          hours: z.number().int().positive().max(8760),
          warnPct: z.number().int().min(1).max(200),
          escalatePct: z.number().int().min(1).max(300),
          escalateRole: z.enum(ROLES).nullable(),
        })
        .refine((v) => v.warnPct < v.escalatePct, {
          message: 'El umbral de alerta debe ser menor que el de escalamiento',
          path: ['warnPct'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const actual = await ctx.prisma.slaRule.findUnique({
        where: { stateCode: input.stateCode },
      });
      if (!actual) throw new TRPCError({ code: 'NOT_FOUND' });

      const actualizada = await ctx.prisma.slaRule.update({
        where: { stateCode: input.stateCode },
        data: {
          hours: input.hours,
          warnPct: input.warnPct,
          escalatePct: input.escalatePct,
          escalateRole: input.escalateRole,
        },
      });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONFIG_SLA',
        entityType: 'SlaRule',
        entityId: actual.stateCode,
        payload: {
          etapa: actual.stateCode,
          de: { horas: actual.hours, aviso: actual.warnPct, escala: actual.escalatePct },
          a: { horas: input.hours, aviso: input.warnPct, escala: input.escalatePct },
        },
      });

      return actualizada;
    }),

  /** Añade un ítem a una lista de valores gobernada. */
  addLovItem: actionProcedure('config.lov')
    .input(z.object({ groupCode: z.string().min(1), label: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const grupo = await ctx.prisma.lovGroup.findUnique({
        where: { code: input.groupCode },
        include: { items: true },
      });
      if (!grupo) throw new TRPCError({ code: 'NOT_FOUND' });

      const code = slugify(input.label);
      if (!SLUG.test(code)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La etiqueta no produce un código válido' });
      }
      if (grupo.items.some((i) => i.code === code)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ese valor ya existe en la lista' });
      }

      const item = await ctx.prisma.lovItem.create({
        data: {
          groupId: grupo.id,
          code,
          label: input.label.trim(),
          order: grupo.items.length + 1,
        },
      });

      await appendAuditRow({
        prisma: ctx.prisma,
        tenantId: ctx.user.tenantId,
        actorId: ctx.user.id,
        action: 'CONFIG_LOV',
        entityType: 'LovItem',
        entityId: item.id,
        payload: { grupo: grupo.code, code, label: item.label },
      });

      return { code: item.code, label: item.label };
    }),
});
