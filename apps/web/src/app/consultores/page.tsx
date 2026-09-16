'use client';

import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function ConsultoresPage() {
  const { data, isLoading, error } = trpc.consultants.list.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Consultores</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ecosistema de consultores habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-ink-muted">Cargando consultores…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
          {data && data.length === 0 && (
            <p className="text-sm text-ink-muted">Aún no hay consultores.</p>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Consultor</th>
                    <th className="py-2 pr-3 font-medium">Correo</th>
                    <th className="py-2 pr-3 font-medium text-right">Asignados</th>
                    <th className="py-2 pr-3 font-medium text-right">Postulaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-teal-deep text-white flex items-center justify-center text-[10px] font-bold">
                            {u.name.slice(0, 2).toUpperCase()}
                          </span>
                          {u.name}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-ink-muted font-[family-name:var(--font-mono)] text-[12px]">
                        {u.email}
                      </td>
                      <td className="py-2 pr-3 text-right font-[family-name:var(--font-mono)]">
                        {u.asignados}
                      </td>
                      <td className="py-2 pr-3 text-right font-[family-name:var(--font-mono)]">
                        {u.postulaciones}
                      </td>
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
