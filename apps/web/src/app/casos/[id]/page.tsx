'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck, ShieldAlert, Download, Upload, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type DocKind = 'anexo' | 'entregable' | 'evidencia';

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const utils = trpc.useUtils();

  const caseQ = trpc.cases.byId.useQuery({ id });
  const transitionsQ = trpc.cases.availableTransitions.useQuery({ caseId: id });

  const [actionError, setActionError] = useState<string | null>(null);
  const [chain, setChain] = useState<{ valid: boolean; count: number; brokenSeq: number | null } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [docTitle, setDocTitle] = useState('');
  const [docKind, setDocKind] = useState<DocKind>('entregable');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docOk, setDocOk] = useState<string | null>(null);

  const docsQ = trpc.documents.list.useQuery({ caseId: id }, { enabled: !!caseQ.data && !caseQ.data.masked });

  const uploadDoc = trpc.documents.upload.useMutation();
  const confirmDoc = trpc.documents.confirm.useMutation();
  const downloadDoc = trpc.documents.downloadUrl.useMutation({
    onError: (e) => setDocError(e.message),
  });

  async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setDocError(null);
    setDocOk(null);
    try {
      const checksum = await sha256Hex(await file.arrayBuffer());
      const res = await uploadDoc.mutateAsync({
        caseId: id,
        kind: docKind,
        title: docTitle.trim() || file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        checksum,
        filename: file.name,
      });
      const put = await fetch(res.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('La subida al bucket falló (' + put.status + ')');

      // El servidor lee el archivo del repositorio y recalcula su sha256: hasta
      // que no coincide con el declarado, la versión no cuenta ni se descarga.
      await confirmDoc.mutateAsync({ caseId: id, documentId: res.documentId, version: res.version });
      setDocOk(`Subido y verificado (v${res.version}).`);
      await Promise.all([
        utils.documents.list.invalidate({ caseId: id }),
        utils.cases.byId.invalidate({ id }),
        utils.notifications.recent.invalidate(),
      ]);
      setFile(null);
      setDocTitle('');
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(documentId: string, version?: number) {
    setDocError(null);
    downloadDoc.mutate(
      { caseId: id, documentId, version },
      {
        onSuccess: (res) => window.open(res.url, '_blank'),
      },
    );
  }

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

      {/* Repositorio documental (F3) */}
      {!c.masked && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <FileText size={16} /> Documentos del caso
              </span>
              <span className="text-xs font-normal text-ink-muted">
                {docsQ.data?.length ?? 0} documento(s) · {docsQ.data?.reduce((n, d) => n + d.versions.length, 0) ?? 0} versión(es)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-40">
                <span className="text-ink-muted">Título</span>
                <input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="p. ej. Entregable Fase 1"
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm min-w-32">
                <span className="text-ink-muted">Tipo</span>
                <select
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as DocKind)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  <option value="entregable">Entregable</option>
                  <option value="anexo">Anexo</option>
                  <option value="evidencia">Evidencia</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm min-w-40 flex-1">
                <span className="text-ink-muted">Archivo</span>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={!file || uploading}
                onClick={handleUpload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-deep text-white text-sm font-medium px-3 py-2 shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <Upload size={14} /> {uploading ? 'Subiendo…' : 'Subir'}
              </button>
            </div>

            {docError && <p role="alert" className="text-sm text-danger">{docError}</p>}
            {docOk && <p role="status" className="text-sm text-success">{docOk}</p>}

            <div>
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-2">
                El archivo se sube directo al bucket (MinIO local / Cloudflare R2 en producción)
              </p>
              <ul className="flex flex-col gap-3">
                {docsQ.data && docsQ.data.length === 0 && (
                  <li className="text-sm text-ink-muted">Aún no hay documentos en este caso.</li>
                )}
                {docsQ.data?.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          {d.title}
                          <span className="ml-2 text-xs font-normal text-ink-muted">
                            {d.kind} · etapa {d.stateCode}
                          </span>
                        </div>
                        <div className="text-xs text-ink-muted">
                          {d.versions.length} versión(es) · actual v{d.currentVersion}
                        </div>
                      </div>
                    </div>
                    <ol className="mt-2 flex flex-col gap-1.5">
                      {d.versions.map((v) => (
                        <li key={v.version} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-xs">
                            v{v.version} · {(v.sizeBytes / 1024).toFixed(1)} KB · {v.mime} ·{' '}
                            {v.uploadedByName} ·{' '}
                            {new Date(v.uploadedAt).toLocaleString('es-CO')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownload(d.id, v.version)}
                            disabled={downloadDoc.isPending}
                            className="inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-border px-2 py-1 hover:bg-cream-dark disabled:opacity-60"
                          >
                            <Download size={13} /> Descargar v{v.version}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Datos de apertura (submission de plantilla) */}
      {c.submissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Datos de apertura · {c.submissions[0].templateVersion.template.code} v
              {c.submissions[0].templateVersion.version}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {Object.entries((c.submissions[0].data ?? {}) as Record<string, unknown>).map(
                ([k, v]) => (
                  <li key={k} className="flex gap-3">
                    <span className="text-ink-muted capitalize w-28 shrink-0">{k}</span>
                    <span>{String(v)}</span>
                  </li>
                ),
              )}
            </ul>
          </CardContent>
        </Card>
      )}

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
