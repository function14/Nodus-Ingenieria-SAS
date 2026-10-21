'use client';

import { useRouter } from 'next/navigation';
import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';

type Empresa = RouterOutputs['companies']['overview'][number];

export default function EmpresasPage() {
  const { data, isLoading, error } = trpc.companies.overview.useQuery();
  const router = useRouter();

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
    {
      key: 'ir',
      header: '',
      render: () => (
        <span className="inline-flex items-center gap-1 text-xs text-primary-deep">
          Ver casos <ArrowRight size={12} aria-hidden="true" />
        </span>
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
            // El principio "empresa única, casos múltiples" solo se ve si desde
            // la empresa se puede llegar a sus casos. Antes era un callejón sin
            // salida: el número de casos no llevaba a ninguna parte.
            onRowClick={(c) => router.push(`/casos?empresa=${encodeURIComponent(c.name)}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
