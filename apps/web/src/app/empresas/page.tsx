'use client';

import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function EmpresasPage() {
  const { data, isLoading, error } = trpc.companies.overview.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Empresas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Empresa única · historial de casos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-ink-muted">Cargando empresas…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
          {data && data.length === 0 && (
            <p className="text-sm text-ink-muted">Aún no hay empresas registradas.</p>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Empresa</th>
                    <th className="py-2 pr-3 font-medium">Dominio</th>
                    <th className="py-2 pr-3 font-medium text-right">Casos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{c.name}</td>
                      <td className="py-2 pr-3 text-ink-muted font-[family-name:var(--font-mono)] text-[12px]">
                        {c.emailDomain ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-[family-name:var(--font-mono)]">
                        {c.casos}
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
