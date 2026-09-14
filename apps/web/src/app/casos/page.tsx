'use client';

import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function CasosPage() {
  const { data, isLoading, error } = trpc.cases.list.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Casos</h1>
      <Card>
        <CardHeader>
          <CardTitle>Casos en curso · desde PostgreSQL</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-ink-muted">Cargando casos…</p>}

          {error && (
            <p role="alert" className="text-sm text-danger">
              No se pudieron cargar los casos: {error.message}
            </p>
          )}

          {data && data.length === 0 && (
            <p className="text-sm text-ink-muted">Aún no hay casos registrados.</p>
          )}

          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Empresa</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-[12px]">
                        {c.humanId}
                      </td>
                      <td className="py-2 pr-3">{c.company}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.state.color ?? '#64748B' }}
                            aria-hidden="true"
                          />
                          {c.state.name}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-ink-muted">{c.assignee ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
