'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderOpen, CheckCircle2, HelpCircle, Plus, UserCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { StatBlock } from '@/components/ui/stat-block';
import { RadialTimer } from '@/components/ui/radial-timer';
import { SkeletonKpis, SkeletonCards } from '@/components/ui/skeleton';

/**
 * Portal de la mipyme.
 *
 * El encargo pide «asistente paso a paso con ring de progreso y tarjetas de
 * decisión grandes». La idea de fondo es que la empresa no conoce —ni tiene por
 * qué— el maestro de 17 estados: lo que necesita saber es en qué punto va su
 * caso y si le toca decidir algo.
 *
 * Por eso lo primero de la página son las decisiones pendientes, con el nombre
 * de la transición tal como lo define el workflow. No se inventa aquí ninguna
 * etiqueta: si Administración renombra la transición, este botón cambia solo.
 */
export function Portal() {
  const router = useRouter();
  const { data, isLoading, error } = trpc.dashboard.mipyme.useQuery();

  const conDecision = (data?.misCasos ?? []).filter((c) => c.decisiones.length > 0);
  const enCurso = (data?.misCasos ?? []).filter((c) => !c.terminal && c.decisiones.length === 0);
  const cerrados = (data?.misCasos ?? []).filter((c) => c.terminal);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Mis casos</h1>
          <p className="text-sm text-ink-muted">
            El estado de cada solicitud de tu empresa y lo que está esperando una decisión tuya.
          </p>
        </div>
        <Link
          href="/casos/nuevo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-deep text-white text-sm font-medium px-3 py-2 hover:opacity-90"
        >
          <Plus size={15} aria-hidden="true" />
          Abrir un caso
        </Link>
      </div>

      {isLoading && (
        <>
          <SkeletonKpis count={4} />
          <SkeletonCards count={2} />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBlock
              label="Casos abiertos"
              value={data.resumen.activos}
              delta={`${data.resumen.total} en total`}
              icon={FolderOpen}
              href="/casos?cierre=abiertos"
              cta="Ver la lista"
            />
            <StatBlock
              label="Esperan tu decisión"
              value={data.resumen.decisionesPendientes}
              delta={
                data.resumen.decisionesPendientes > 0 ? 'Revísalos abajo' : 'Nada por decidir'
              }
              tono={data.resumen.decisionesPendientes > 0 ? 'alerta' : 'neutral'}
              icon={HelpCircle}
              // Sin decisiones pendientes el bloque de abajo no se renderiza, y
              // un enlace a un ancla que no existe no hace nada: peor que no
              // tener enlace.
              href={data.resumen.decisionesPendientes > 0 ? '#esperan-tu-decision' : undefined}
              cta="Ir a las decisiones"
            />
            <StatBlock
              label="Cerrados"
              value={data.resumen.cerrados}
              delta="historial"
              icon={CheckCircle2}
              href="/casos?cierre=cerrados"
              cta="Ver el historial"
            />
            <StatBlock
              label="Con consultor"
              value={data.misCasos.filter((c) => c.consultor).length}
              delta="ya asignados"
              icon={UserCheck}
              href="/casos?responsable=asignado"
              cta="Ver quién lleva cada caso"
            />
          </section>

          {conDecision.length > 0 && (
            <section id="esperan-tu-decision" className="flex flex-col gap-3 scroll-mt-4">
              <h2 className="text-lg font-[family-name:var(--font-display)] font-bold">
                Esperan tu decisión
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {conDecision.map((c) => (
                  <Card key={c.id} className="border-2 border-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2 normal-case tracking-normal">
                        <span className="min-w-0 truncate" title={c.title}>
                          {c.title}
                        </span>
                        <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted shrink-0">
                          {c.humanId}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <RadialTimer
                          pct={c.progresoPct}
                          label={`${c.etapa}/${c.etapas}`}
                          color="#F97316"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.state.name}</p>
                          {c.consultor && (
                            <p className="text-xs text-ink-muted truncate">
                              Consultor: {c.consultor}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Tarjetas de decisión grandes: el nombre sale del
                          workflow, no de una etiqueta escrita a mano aquí. */}
                      <div className="flex flex-col gap-2">
                        {c.decisiones.map((d) => (
                          <button
                            key={d.code}
                            type="button"
                            onClick={() => router.push(`/casos/${c.id}`)}
                            className="w-full text-left rounded-lg border-2 border-border hover:border-ink transition-colors px-3 py-2.5"
                          >
                            <span className="block text-sm font-medium">{d.name}</span>
                            <span className="block text-xs text-ink-muted">
                              Lleva el caso a «{d.to}»
                            </span>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <Card>
            <CardHeader>
              <CardTitle>En curso ({enCurso.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {enCurso.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No tienes casos en curso sin decisión pendiente.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {enCurso.map((c) => (
                    <li key={c.id} className="py-3 flex items-center gap-3">
                      <div
                        className="w-10 h-1.5 rounded-full bg-cream-dark overflow-hidden shrink-0"
                        role="img"
                        aria-label={`Etapa ${c.etapa} de ${c.etapas}`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.progresoPct}%`,
                            backgroundColor: c.state.color ?? '#F97316',
                          }}
                        />
                      </div>
                      <Link
                        href={`/casos/${c.id}`}
                        className="text-sm font-medium hover:underline min-w-0 truncate"
                      >
                        {c.title}
                      </Link>
                      <Chip label={c.state.name} title="Estado actual" />
                      <span className="text-xs text-ink-muted ml-auto shrink-0 font-[family-name:var(--font-mono)]">
                        {c.etapa}/{c.etapas}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {cerrados.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cerrados ({cerrados.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {cerrados.map((c) => (
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
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
