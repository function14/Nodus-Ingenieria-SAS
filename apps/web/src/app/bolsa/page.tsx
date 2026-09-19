'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

function Postulantes({ caseId }: { caseId: string }) {
  const utils = trpc.useUtils();
  const q = trpc.postulations.listForCase.useQuery({ caseId });
  const assign = trpc.cases.assign.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.postulations.bolsa.invalidate(),
        utils.postulations.listForCase.invalidate({ caseId }),
        utils.cases.list.invalidate(),
      ]);
    },
  });

  if (q.isLoading) return <p className="text-sm text-ink-muted">Cargando postulantes…</p>;
  if (!q.data || q.data.length === 0)
    return <p className="text-sm text-ink-muted">Sin postulantes todavía.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {q.data.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
          <span>
            {p.consultor}
            {p.note ? <span className="text-ink-muted"> · {p.note}</span> : null}
            {p.status !== 'PENDIENTE' && (
              <span className="text-ink-muted"> · {p.status}</span>
            )}
          </span>
          <button
            type="button"
            disabled={assign.isPending || p.status === 'ASIGNADO'}
            onClick={() => assign.mutate({ caseId, consultorId: p.consultorId })}
            className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-cream-dark disabled:opacity-50"
          >
            {p.status === 'ASIGNADO' ? 'Asignado' : 'Asignar'}
          </button>
        </li>
      ))}
      {assign.error && <p role="alert" className="text-sm text-danger">{assign.error.message}</p>}
    </ul>
  );
}

export default function BolsaPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const utils = trpc.useUtils();
  const bolsaQ = trpc.postulations.bolsa.useQuery();
  const miPerfilQ = trpc.consultants.my.useQuery(undefined, { enabled: role === 'consultor' });

  const apply = trpc.postulations.postular.useMutation({
    onSuccess: () => utils.postulations.bolsa.invalidate(),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Bolsa interna</h1>

      {role && role !== 'consultor' && role !== 'advisory' && (
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted pt-4">
              La bolsa es para consultores (postularse) y Advisory/PMO (asignar).
            </p>
          </CardContent>
        </Card>
      )}

      {role === 'consultor' && miPerfilQ.data?.status !== 'habilitado' && (
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted pt-4">
              Tu perfil consultor está <strong>{miPerfilQ.data?.status ?? 'sin ficha'}</strong>.
              Solo ves casos cuando estás <strong>HABILITADO</strong> (RF-028): debes completar tu
              experiencia desde tu perfil y el equipo te habilita.
            </p>
          </CardContent>
        </Card>
      )}

      {bolsaQ.isLoading && <p className="text-sm text-ink-muted">Cargando bolsa…</p>}
      {bolsaQ.data && bolsaQ.data.length === 0 && (
        <p className="text-sm text-ink-muted">No hay casos clasificados en bolsa ahora mismo.</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {bolsaQ.data?.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{c.company}</span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                  {c.humanId}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">{c.title}</p>
              <p className="text-xs text-ink-muted">
                Area: <strong>{c.area}</strong> · Complejidad: <strong>{c.complejidad}</strong>
              </p>
              <p className="text-xs text-ink-muted">{c.postulantes} postulante(s)</p>

              {role === 'consultor' && (
                <button
                  type="button"
                  disabled={c.yaPostulado || apply.isPending}
                  onClick={() => apply.mutate({ caseId: c.id })}
                  className="rounded-lg bg-teal-deep text-white text-sm font-medium px-3 py-2 shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60 w-fit"
                >
                  {c.yaPostulado ? 'Ya te postulaste' : 'Postularme'}
                </button>
              )}

              {role === 'advisory' && <Postulantes caseId={c.id} />}
            </CardContent>
          </Card>
        ))}
      </div>

      {apply.error && <p role="alert" className="text-sm text-danger">{apply.error.message}</p>}
    </div>
  );
}
