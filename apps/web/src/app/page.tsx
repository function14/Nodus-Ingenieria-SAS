'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sparkles, Clock3, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { StatBlock } from '@/components/ui/stat-block';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SLAHeatmap } from '@/components/ui/sla-heatmap';
import { FunnelChart } from '@/components/ui/funnel-chart';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { RadialTimer } from '@/components/ui/radial-timer';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const isPmo = role === 'advisory' || role === 'admin';

  useEffect(() => {
    if (status === 'authenticated' && role && !isPmo) {
      router.replace('/casos');
    }
  }, [status, role, isPmo, router]);

  const { data, isLoading } = trpc.dashboard.pmo.useQuery(undefined, { enabled: isPmo });
  const utils = trpc.useUtils();
  const sweep = trpc.sla.sweep.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.dashboard.pmo.invalidate(), utils.notifications.recent.invalidate()]);
    },
  });

  if (status === 'authenticated' && role && !isPmo) {
    return <p className="text-sm text-ink-muted">Redirigiendo a tus casos…</p>;
  }

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
      {sweep.data && (
        <p className="text-xs text-ink-muted -mt-2">
          Barrido SLA: {sweep.data.warned} en riesgo, {sweep.data.breached} vencidos.
        </p>
      )}

      {isLoading && <p className="text-sm text-ink-muted">Cargando panel…</p>}

      {data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.kpis.map((kpi) => (
              <StatBlock key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta} />
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
                  <AlertTriangle size={15} className="text-warn" />
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

          <Card>
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
              <KanbanBoard columns={data.pipeline} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
