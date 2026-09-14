import { StatBlock } from '@/components/ui/stat-block';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SLAHeatmap } from '@/components/ui/sla-heatmap';
import { FunnelChart } from '@/components/ui/funnel-chart';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { RadialTimer } from '@/components/ui/radial-timer';
import { kpis, radialTimers } from '@/lib/mock-data';
import { Sparkles, Clock3, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Dashboard PMO</h1>
        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted">
          <Sparkles size={14} />
          Command Center Solar
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <StatBlock key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta} />
        ))}
      </section>

      {/* SLA heatmap + timers */}
      <section className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 size={15} className="text-primary" />
              SLA por etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SLAHeatmap />
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
            {radialTimers.map((t) => (
              <RadialTimer key={t.label} {...t} />
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Embudo de conversión</CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelChart />
        </CardContent>
      </Card>

      {/* Kanban */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline de casos</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <KanbanBoard />
        </CardContent>
      </Card>
    </div>
  );
}