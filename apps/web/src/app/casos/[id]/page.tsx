'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck, ShieldAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const utils = trpc.useUtils();

  const caseQ = trpc.cases.byId.useQuery({ id });
  const transitionsQ = trpc.cases.availableTransitions.useQuery({ caseId: id });

  const [actionError, setActionError] = useState<string | null>(null);
  const [chain, setChain] = useState<{ valid: boolean; count: number; brokenSeq: number | null } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const transition = trpc.cases.transition.useMutation({
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await Promise.all([
        utils.cases.byId.invalidate({ id }),
        utils.cases.availableTransitions.invalidate({ caseId: id }),
        utils.cases.list.invalidate(),
        utils.notifications.recent.invalidate(),
      ]);
      setChain(null);
    },
    onError: (e) => setActionError(e.message),
  });

  async function verifyIntegrity() {
    setVerifying(true);
    try {
      const res = await utils.audit.verifyChain.fetch();
      setChain(res);
    } finally {
      setVerifying(false);
    }
  }

  if (caseQ.isLoading) return <p className="text-sm text-ink-muted">Cargando expediente…</p>;
  if (caseQ.error || !caseQ.data)
    return <p role="alert" className="text-sm text-danger">No se encontró el caso.</p>;

  const c = caseQ.data;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Link href="/casos" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink w-fit">
        <ArrowLeft size={16} /> Casos
      </Link>

      {/* Cabecera del caso */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-[family-name:var(--font-mono)] text-xs text-ink-muted">{c.humanId}</div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">{c.company.name}</h1>
          <p className="text-sm text-ink-muted">{c.title}</p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1 border border-border"
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.currentState.color ?? '#64748B' }} aria-hidden="true" />
          {c.currentState.name}
        </span>
      </div>

      {/* Acciones de workflow */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones disponibles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {transitionsQ.data && transitionsQ.data.length === 0 && (
            <p className="text-sm text-ink-muted">No hay transiciones disponibles para tu rol en este estado.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {transitionsQ.data?.map((t) => (
              <button
                key={t.code}
                type="button"
                disabled={transition.isPending}
                onClick={() =>
                  transition.mutate({ caseId: id, transitionCode: t.code, expectedVersion: c.version })
                }
                className="rounded-lg bg-primary-deep text-white text-sm font-medium px-3 py-2 shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {t.name} → {t.to}
              </button>
            ))}
          </div>
          {actionError && (
            <p role="alert" className="text-sm text-danger">{actionError}</p>
          )}
        </CardContent>
      </Card>

      {/* Expediente / bitacora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Expediente · bitácora inmodificable</span>
            <button
              type="button"
              onClick={verifyIntegrity}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border px-2 py-1 hover:bg-cream-dark disabled:opacity-60"
            >
              <ShieldCheck size={14} /> {verifying ? 'Verificando…' : 'Verificar integridad'}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chain && (
            <div
              className={`mb-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                chain.valid ? 'text-success' : 'text-danger'
              }`}
            >
              {chain.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {chain.valid
                ? `Cadena íntegra: ${chain.count} registros encadenados sin manipulación.`
                : `Cadena rota en el registro #${chain.brokenSeq}.`}
            </div>
          )}

          <ol className="flex flex-col gap-3">
            {c.auditLogs.map((log) => (
              <li key={log.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                  <span className="flex-1 w-px bg-border mt-1" />
                </div>
                <div className="pb-1">
                  <div className="text-sm font-medium">
                    {log.action}
                    {log.fromState && (
                      <span className="text-ink-muted font-normal">
                        {' '}· {log.fromState} → {log.toState}
                      </span>
                    )}
                    {!log.fromState && log.toState && (
                      <span className="text-ink-muted font-normal"> · {log.toState}</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {log.actor?.name ?? 'system'} ·{' '}
                    {new Date(log.createdAt).toLocaleString('es-CO')}
                  </div>
                  <div className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted/70">
                    #{log.seq} · {log.rowHash.slice(0, 16)}…
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
