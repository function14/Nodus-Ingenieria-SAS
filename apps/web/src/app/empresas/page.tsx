'use client';

import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';

type Empresa = RouterOutputs['companies']['overview'][number];

export default function EmpresasPage() {
  const { data, isLoading, error } = trpc.companies.overview.useQuery();

  const columns: Column<Empresa>[] = [
    {
      key: 'name',
      header: 'Empresa',
      sortValue: (c) => c.name,
      render: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: 'domain',
      header: 'Dominio',
      sortValue: (c) => c.emailDomain ?? '',
      render: (c) => (
        <span className="text-ink-muted font-[family-name:var(--font-mono)] text-[12px]">
          {c.emailDomain ?? '—'}
        </span>
      ),
    },
    {
      key: 'casos',
      header: 'Casos',
      numeric: true,
      sortValue: (c) => c.casos,
      render: (c) => (
        <span className="font-[family-name:var(--font-mono)]">{c.casos}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Empresas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Empresa única · historial de casos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={data}
            columns={columns}
            getRowKey={(c) => c.id}
            isLoading={isLoading}
            error={error}
            searchText={(c) => `${c.name} ${c.emailDomain ?? ''}`}
            searchPlaceholder="Buscar empresa o dominio…"
            emptyMessage="Aún no hay empresas registradas."
          />
        </CardContent>
      </Card>
    </div>
  );
}
