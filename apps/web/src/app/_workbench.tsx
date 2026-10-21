'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Send, AlertTriangle, ArrowRight, Lock, Inbox } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { StatBlock } from '@/components/ui/stat-block';
import { SkeletonKpis, SkeletonCards } from '@/components/ui/skeleton';

/**
 * Workbench del consultor.
 *
 * El consultor no necesita un panel de métricas: necesita saber qué espera algo
 * de él. Por eso la vista se ordena por obligación —primero los casos donde le
 * toca mover, después los que solo vigila, y al final sus postulaciones— en vez
 * de por fecha.
 *
 * La bolsa no se replica aquí: se enlaza. Duplicar la consulta duplicaría el
 * filtro de elegibilidad, y así es como dos vistas acaban dando respuestas
 * distintas a la misma pregunta.
 */
export function Workbench() {
  const router = useRouter();
  const { data, isLoading, error } = trpc.dashboard.consultor.useQuery();
  const { data: bolsa } = trpc.postulations.bolsa.useQuery();

  const pendientes = (data?.misCasos ?? []).filter((c) => c.acciones.length > 0);
  const vigilando = (data?.misCasos ?? []).filter((c) => c.acciones.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Mi workbench</h1>
        <p className="text-sm text-ink-muted">
          Lo que espera algo de ti, primero. Los casos sin acción pendiente quedan abajo.
        </p>
      </div>

      {isLoading && <SkeletonKpis count={4} />}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBlock
              label="Casos asignados"
              value={data.resumen.asignados}
              delta="en curso"
              icon={Briefcase}
            />
            <StatBlock
              label="Esperan mi acción"
              value={data.resumen.pendientesDeMi}
              delta={data.resumen.pendientesDeMi > 0 ? 'Puedes avanzarlos ya' : 'Nada pendiente'}
              icon={ArrowRight}
            />
            <StatBlock
              label="SLA en riesgo"
              value={data.resumen.enRiesgo}
              delta={data.resumen.enRiesgo > 0 ? 'Requieren acción' : 'Todo a tiempo'}
              tono={data.resumen.enRiesgo > 0 ? 'alerta' : 'neutral'}
              icon={AlertTriangle}
            />
            <StatBlock
              label="Postulaciones abiertas"
              value={data.resumen.postulacionesAbiertas}
              delta="sin resolver"
              icon={Send}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight size={15} className="text-primary" aria-hidden="true" />
                Te toca mover ({pendientes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendientes.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Ningún caso espera una acción tuya ahora mismo.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {pendientes.map((c) => (
                    <li key={c.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                        {c.humanId}
                      </span>
                      <Link
                        href={`/casos/${c.id}`}
                        className="font-medium text-sm hover:underline min-w-0 truncate"
                      >
                        {c.title}
                      </Link>
                      <Chip
                        label={c.state.name}
                        colorClass="bg-cream-dark text-ink-muted"
                        title="Estado actual"
                      />
                      {c.sla && (c.sla.vencido || c.sla.enRiesgo) && (
                        <Chip
                          label={c.sla.vencido ? `SLA vencido` : `SLA ${c.sla.pct}%`}
                          colorClass={
                            c.sla.vencido ? 'bg-danger/10 text-danger' : 'bg-warn/15 text-warn-deep'
                          }
                          title="Reloj de la etapa actual"
                        />
                      )}
                      <span className="ml-auto flex flex-wrap gap-1.5">
                        {c.acciones.map((a) => (
                          <button
                            key={a.code}
                            type="button"
                            onClick={() => router.push(`/casos/${c.id}`)}
                            className="inline-flex items-center gap-1 rounded-lg bg-ink text-white text-[11px] font-medium px-2 py-1 hover:opacity-90"
                            title={`Lleva el caso a ${a.to}`}
                          >
                            {a.name}
                            <ArrowRight size={11} aria-hidden="true" />
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <section className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase size={15} className="text-ink-muted" aria-hidden="true" />
                  Vigilando ({vigilando.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vigilando.length === 0 ? (
                  <p className="text-sm text-ink-muted">Sin casos en espera.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {vigilando.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.state.color ?? '#64748B' }}
                          aria-hidden="true"
                        />
                        <Link href={`/casos/${c.id}`} className="truncate hover:underline">
                          {c.title}
                        </Link>
                        <span className="text-xs text-ink-muted ml-auto shrink-0">
                          {c.state.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-2">
                    <Send size={15} className="text-ink-muted" aria-hidden="true" />
                    Mis postulaciones
                  </span>
                  <Link
                    href="/bolsa"
                    className="text-xs font-medium rounded-lg border border-border px-2 py-1 hover:bg-cream-dark"
                  >
                    Ver la bolsa{typeof bolsa?.length === 'number' ? ` (${bolsa.length})` : ''}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.postulaciones.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Inbox size={26} className="text-ink-muted/50" aria-hidden="true" />
                    <p className="text-sm text-ink-muted">Todavía no te has postulado a nada.</p>
                    <p className="text-xs text-ink-muted/80 max-w-xs">
                      En la bolsa solo aparecen las oportunidades que encajan con tu ficha: estado,
                      especialidad, nivel y disponibilidad.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {data.postulaciones.map((p) => (
                      <li key={p.id} className="py-2 flex items-center gap-2 text-sm">
                        <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted shrink-0">
                          {p.humanId}
                        </span>
                        <span
                          className={`min-w-0 truncate flex items-center gap-1 ${
                            p.masked ? 'italic text-ink-muted' : ''
                          }`}
                        >
                          {p.masked && <Lock size={11} className="shrink-0" aria-hidden="true" />}
                          {p.company}
                        </span>
                        <Chip
                          label={p.status.toLowerCase()}
                          colorClass={
                            p.status === 'ASIGNADO'
                              ? 'bg-success/15 text-success-deep'
                              : p.status === 'RECHAZADO'
                                ? 'bg-cream-dark text-ink-muted'
                                : 'bg-primary/10 text-primary-deep'
                          }
                          title="Resultado de la postulación"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {isLoading && <SkeletonCards count={3} />}
    </div>
  );
}
