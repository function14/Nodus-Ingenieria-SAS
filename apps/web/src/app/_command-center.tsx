'use client';

import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Clock3,
  AlertTriangle,
  FolderOpen,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { SkeletonKpis } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { StatBlock } from '@/components/ui/stat-block';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SLAHeatmap } from '@/components/ui/sla-heatmap';
import { FunnelChart } from '@/components/ui/funnel-chart';
import { PhaseBoard } from '@/components/ui/phase-board';
import { RadialTimer } from '@/components/ui/radial-timer';

/** Icono por KPI. La `key` la manda el servidor para no acoplar al texto. */
const KPI_ICON: Record<string, typeof Clock3> = {
  activos: FolderOpen,
  sla: AlertTriangle,
  conversion: TrendingUp,
  cerrados: CheckCircle2,
};

/**
 * A dónde lleva cada KPI. Igual que el icono, se resuelve por `key` y no por
 * la etiqueta: el servidor manda el dato y el enrutado se queda en la UI, que
 * es de quien es.
 *
 * Cada destino es la lista EXACTA que esa cifra cuenta, usando el filtro de
 * `/casos`. Un KPI que dice 10 y te deja en una lista de 14 destruye la
 * confianza en el panel entero, así que «activos» y «cerrados» van filtrados
 * por `cierre`, que se resuelve con el `isTerminal` del workflow.
 *
 * Dos casos no son una lista de casos y se tratan distinto en vez de forzarlos:
 *
 * - «Conversión» es un porcentaje; lo que lo explica es el embudo, que está en
 *   esta misma página. El enlace baja hasta él.
 * - «SLA críticos» cuenta relojes vencidos, no casos. Lleva al centro de SLA y
 *   alertas, donde vive el aviso de cada vencimiento. El desglose caso a caso
 *   exigiría exponer el SLA en `cases.list`, y el cálculo del porcentaje ya
 *   vive en la proyección del consultor: duplicarlo es cómo dos vistas acaban
 *   dando números distintos. Si ese drill-down se quiere, primero se extrae el
 *   cálculo a un sitio único.
 */
const KPI_DESTINO: Record<string, { href: string; cta: string }> = {
  activos: { href: '/casos?cierre=abiertos', cta: 'Ver los casos activos' },
  sla: { href: '/alertas', cta: 'Ver SLA y alertas' },
  conversion: { href: '#embudo', cta: 'Ver el embudo' },
  cerrados: { href: '/casos?cierre=cerrados', cta: 'Ver los cerrados' },
};

/**
 * Command Center del PMO.
 *
 * Vive en su propio archivo porque `/` sirve ahora tres paneles distintos y
 * cada uno trae sus propios hooks: tenerlos en un solo componente obligaba a
 * desactivar consultas con banderas, que es la vía rápida a pedir datos que el
 * rol no puede leer y comerse un 403 en pantalla.
 */
export function CommandCenter() {
  const router = useRouter();
  const { data, isLoading } = trpc.dashboard.pmo.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();
  const sweep = trpc.sla.sweep.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: async (r) => {
      toast.info(`Barrido de SLA: ${r.warned} en riesgo, ${r.breached} vencidos.`);
      await Promise.all([utils.dashboard.pmo.invalidate(), utils.notifications.recent.invalidate()]);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Dashboard PMO</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => sweep.mutate()}
            disabled={sweep.isPending}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-cream-dark disabled:opacity-60"
          >
            {sweep.isPending ? 'Revisando…' : 'Revisar SLA'}
          </button>
          <span className="hidden sm:flex items-center gap-2 text-xs text-ink-muted">
            <Sparkles size={14} />
            Command Center Solar
          </span>
        </div>
      </div>

      {isLoading && <SkeletonKpis count={4} />}

      {data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.kpis.map((kpi) => (
              <StatBlock
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                delta={kpi.delta}
                tono={kpi.tono}
                icon={KPI_ICON[kpi.key]}
                href={KPI_DESTINO[kpi.key]?.href}
                cta={KPI_DESTINO[kpi.key]?.cta}
              />
            ))}
          </section>

          <section className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 size={15} className="text-primary" />
                  SLA por etapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SLAHeatmap data={data.slaByStage} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-warn-deep" />
                  Timers SLA
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-center gap-5 pt-2">
                {data.radialTimers.length > 0 ? (
                  data.radialTimers.map((t) => <RadialTimer key={t.label} {...t} />)
                ) : (
                  <p className="text-sm text-ink-muted">Sin timers activos.</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Destino del KPI «Conversión»: el embudo es lo que explica el
              porcentaje, y ya está en esta página. */}
          <Card id="embudo">
            <CardHeader>
              <CardTitle>Embudo de conversión</CardTitle>
            </CardHeader>
            <CardContent>
              <FunnelChart data={data.funnel} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline de casos</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-xs text-ink-muted mb-3">
                Agrupado por fase del flujo. El estado exacto va dentro de cada columna: la
                pregunta de un PMO es en qué fase se atasca el flujo, no en cuál de los 17 estados.
              </p>
              <PhaseBoard fases={data.pipeline} onCardClick={(c) => router.push(`/casos/${c.id}`)} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
