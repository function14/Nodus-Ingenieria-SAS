'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
            <div className={`mb-3 flex items-center gap-2 text-sm ${chain.valid ? 'text-success' : 'text-danger'}`}>
              {chain.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {chain.valid
                ? `Cadena íntegra: ${chain.count} registros sin manipulación.`
                : `Cadena rota en el registro #${chain.brokenSeq}.`}
            </div>
          )}

          {isLoading && <p className="text-sm text-ink-muted">Cargando bitácora…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Acción</th>
                    <th className="py-2 pr-3 font-medium">Caso</th>
                    <th className="py-2 pr-3 font-medium">Actor</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.seq} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-ink-muted">{r.seq}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{r.action}</span>
                        {r.fromState && (
                          <span className="text-ink-muted"> · {r.fromState} → {r.toState}</span>
                        )}
                        {!r.fromState && r.toState && <span className="text-ink-muted"> · {r.toState}</span>}
                      </td>
                      <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-[12px]">
                        {r.caseHumanId ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-ink-muted">{r.actor}</td>
                      <td className="py-2 pr-3 text-ink-muted text-xs">
                        {new Date(r.createdAt).toLocaleString('es-CO')}
                      </td>
                      <td className="py-2 pr-3 font-[family-name:var(--font-mono)] text-[10px] text-ink-muted/70">
                        {r.rowHash.slice(0, 12)}…
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
