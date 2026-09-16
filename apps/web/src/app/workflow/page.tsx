'use client';

import { ArrowDown } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function WorkflowPage() {
  const { data, isLoading, error } = trpc.workflow.graph.useQuery();

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Workflow</h1>
        <p className="text-sm text-ink-muted">
          Máquina de estados gobernada por datos: estados y transiciones viven en la DB, no en código.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Cargando máquina de estados…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>
              {data.states.length} estados · {data.transitions.length} transiciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-stretch gap-0">
              {data.states.map((s, idx) => {
                const outgoing = data.transitions.filter((t) => t.from === s.code);
                return (
                  <div key={s.code} className="flex flex-col">
                    {/* Nodo de estado */}
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
                      {s.isInitial && (
                        <span className="text-[10px] rounded-full bg-teal/15 text-teal-deep px-1.5 py-0.5">
                          inicial
                        </span>
                      )}
                      {s.isTerminal && (
                        <span className="text-[10px] rounded-full bg-success/15 text-success px-1.5 py-0.5">
                          terminal
                        </span>
                      )}
                    </div>

                    {/* Transiciones salientes */}
                    {outgoing.map((t) => (
                      <div key={t.code} className="flex items-start gap-2 pl-3 py-2 text-sm">
                        <ArrowDown size={16} className="text-ink-muted mt-0.5 shrink-0" />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{t.name}</span>
                          <span className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted">
                            → {t.to}
                          </span>
                          {t.allowedRoles.map((r) => (
                            <span
                              key={r}
                              className="text-[10px] rounded-full bg-primary/10 text-primary-deep px-1.5 py-0.5"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Conector visual entre nodos consecutivos sin transicion listada */}
                    {outgoing.length === 0 && idx < data.states.length - 1 && (
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
