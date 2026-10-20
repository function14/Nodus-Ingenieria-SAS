'use client';

import { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { SkeletonLines } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';

const ROLES = ['advisory', 'consultor', 'mipyme', 'admin', 'system'] as const;

/**
 * Qué significa cada guarda declarativa, en castellano. Vive aquí y no en el
 * servidor porque es texto de interfaz; el tipo de guarda sí es dato.
 */
const GUARDAS: Record<string, string> = {
  assigneeMustAct: 'Solo el consultor asignado',
  companyOwnerMustAct: 'Solo la empresa dueña del caso',
  assigneeRequired: 'Requiere consultor asignado',
};

export default function WorkflowPage() {
  const { data, isLoading, error } = trpc.workflow.graph.useQuery();
  const [rol, setRol] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Workflow</h1>
        <p className="text-sm text-ink-muted">
          Máquina de estados gobernada por datos: estados, transiciones, roles permitidos y guardas
          viven en la base de datos, no en código.
        </p>
      </div>

      {isLoading && <SkeletonLines lines={6} />}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-2">
              <span>
                {data.states.length} estados · {data.transitions.length} transiciones
              </span>
              {/* Filtrar por rol responde de un vistazo la pregunta que importa:
                  ¿qué puede hacer realmente cada actor en este flujo? */}
              <div role="group" aria-label="Filtrar por rol" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setRol(null)}
                  aria-pressed={rol === null}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                    rol === null ? 'bg-ink text-white' : 'bg-cream-dark text-ink-muted hover:bg-border'
                  }`}
                >
                  Todos
                </button>
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRol(rol === r ? null : r)}
                    aria-pressed={rol === r}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                      rol === r ? 'bg-ink text-white' : 'bg-cream-dark text-ink-muted hover:bg-border'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-stretch gap-0">
              {data.states.map((s, idx) => {
                const salientes = data.transitions.filter(
                  (t) => t.from === s.code && (!rol || t.allowedRoles.includes(rol)),
                );
                // Con un rol filtrado, los estados desde los que no puede hacer
                // nada se atenúan en lugar de desaparecer: así se sigue viendo
                // el flujo completo y dónde ese actor queda fuera.
                const inactivo = rol !== null && salientes.length === 0;

                return (
                  <div key={s.code} className={`flex flex-col ${inactivo ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-offset-sm w-fit">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: s.color ?? '#64748B' }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-sm">{s.name}</span>
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted">
                        {s.code}
                      </span>
                      {s.isInitial && <Chip label="inicial" colorClass="bg-teal/15 text-teal-deep" />}
                      {s.isTerminal && (
                        <Chip label="terminal" colorClass="bg-success/15 text-success-deep" />
                      )}
                    </div>

                    {salientes.map((t) => (
                      <div key={t.code} className="flex items-start gap-2 pl-3 py-2 text-sm">
                        <ArrowDown size={16} className="text-ink-muted mt-0.5 shrink-0" />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{t.name}</span>
                          <span className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted">
                            → {t.to}
                          </span>
                          {t.allowedRoles.map((r) => (
                            <Chip
                              key={r}
                              label={r}
                              colorClass={
                                rol === r
                                  ? 'bg-ink text-white'
                                  : 'bg-primary/10 text-primary-deep'
                              }
                            />
                          ))}
                          {t.guards.map((g, i) => (
                            <Chip
                              key={`${t.code}-g${i}`}
                              label={GUARDAS[g.type ?? ''] ?? (g.type ?? 'guarda')}
                              colorClass="bg-warn/15 text-warn-deep"
                              title={
                                g.role
                                  ? `Solo se evalúa cuando actúa el rol ${g.role}`
                                  : 'Condición que debe cumplirse además del rol'
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    {salientes.length === 0 && idx < data.states.length - 1 && (
                      <div className="pl-3 py-2 text-ink-muted/40">
                        <ArrowDown size={16} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
