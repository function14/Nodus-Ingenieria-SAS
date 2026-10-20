'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Entrada = RouterOutputs['audit']['list'][number];

export default function BitacoraPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.audit.list.useQuery();
  const [chain, setChain] = useState<{ valid: boolean; count: number; brokenSeq: number | null } | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function verify() {
    setVerifying(true);
    try {
      setChain(await utils.audit.verifyChain.fetch());
    } finally {
      setVerifying(false);
    }
  }

  const columns: Column<Entrada>[] = [
    {
      key: 'seq',
      header: '#',
      numeric: true,
      sortValue: (r) => r.seq,
      className: 'font-[family-name:var(--font-mono)] text-ink-muted',
      render: (r) => r.seq,
    },
    {
      key: 'action',
      header: 'Acción',
      sortValue: (r) => r.action,
      render: (r) => (
        <>
          <span className="font-medium">{r.action}</span>
          {r.fromState && (
            <span className="text-ink-muted">
              {' '}· {r.fromState} → {r.toState}
            </span>
          )}
          {!r.fromState && r.toState && <span className="text-ink-muted"> · {r.toState}</span>}
        </>
      ),
    },
    {
      key: 'caso',
      header: 'Caso',
      sortValue: (r) => r.caseHumanId ?? '',
      className: 'font-[family-name:var(--font-mono)] text-[12px]',
      render: (r) => r.caseHumanId ?? '—',
    },
    {
      key: 'actor',
      header: 'Actor',
      sortValue: (r) => r.actor,
      className: 'text-ink-muted',
      render: (r) => r.actor,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      sortValue: (r) => new Date(r.createdAt).getTime(),
      className: 'text-ink-muted text-xs',
      render: (r) => new Date(r.createdAt).toLocaleString('es-CO'),
    },
    {
      key: 'hash',
      header: 'Hash',
      // Copiable: antes se truncaba sin forma de verlo ni verificarlo fuera.
      render: (r) => (
        <button
          type="button"
          title={`Copiar ${r.rowHash}`}
          onClick={() => navigator.clipboard?.writeText(r.rowHash)}
          className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted/70 hover:text-ink transition-colors"
        >
          {r.rowHash.slice(0, 12)}…
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Bitácora</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Registro inmodificable · encadenado por hash</span>
            <button
              type="button"
              onClick={verify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border px-2 py-1 hover:bg-cream-dark disabled:opacity-60"
            >
              <ShieldCheck size={14} /> {verifying ? 'Verificando…' : 'Verificar integridad'}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chain && (
            <div className={`mb-3 flex items-center gap-2 text-sm ${chain.valid ? 'text-success-deep' : 'text-danger'}`}>
              {chain.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {chain.valid
                ? `Cadena íntegra: ${chain.count} registros sin manipulación.`
                : `Cadena rota en el registro #${chain.brokenSeq}.`}
            </div>
          )}
          <DataTable
            rows={data}
            columns={columns}
            getRowKey={(r) => String(r.seq)}
            isLoading={isLoading}
            error={error}
            searchText={(r) => `${r.seq} ${r.action} ${r.caseHumanId ?? ''} ${r.actor} ${r.toState ?? ''}`}
            searchPlaceholder="Buscar por acción, caso o actor…"
            emptyMessage="La bitácora está vacía."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
