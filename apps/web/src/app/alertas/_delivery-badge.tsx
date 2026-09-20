'use client';

import { useState } from 'react';
import { Mail, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Registro de envío de una comunicación (RT-013) y vista previa del correo.
 *
 * Existe para que el canal email se pueda comprobar desde la propia
 * aplicación: quién era el destinatario, con qué asunto y cuerpo salió, en qué
 * estado quedó la entrega y con qué eslabón de la bitácora. Sin esto,
 * verificar el correo exigiría acceso a un buzón.
 */
const ESTADO: Record<string, { texto: string; clase: string }> = {
  sent: { texto: 'entregado', clase: 'text-success' },
  failed: { texto: 'fallo en el envío', clase: 'text-danger' },
  pending: { texto: 'en cola de envío', clase: 'text-ink-muted' },
  not_configured: { texto: 'no enviado — sin proveedor', clase: 'text-warning' },
};

export function DeliveryBadge({
  id,
  channel,
  deliveryStatus,
  recipientEmail,
  subject,
  sentAt,
}: {
  id: string;
  channel: string;
  deliveryStatus: string;
  recipientEmail: string | null;
  subject: string | null;
  sentAt: Date | string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const detalle = trpc.notifications.emailDetail.useQuery({ id }, { enabled: abierto });

  if (channel !== 'email') return null;
  const estado = ESTADO[deliveryStatus] ?? { texto: deliveryStatus, clase: 'text-ink-muted' };

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-surface text-xs">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-wrap">
        <Mail size={12} className="text-ink-muted shrink-0" />
        <span className="font-medium text-ink">Correo</span>
        <span className="text-ink-muted">·</span>
        <span className={estado.clase}>{estado.texto}</span>
        {recipientEmail && (
          <>
            <span className="text-ink-muted">·</span>
            <span className="font-mono text-ink-muted">{recipientEmail}</span>
          </>
        )}
        {sentAt && (
          <>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-muted">{new Date(sentAt).toLocaleString('es-CO')}</span>
          </>
        )}
        {subject && (
          <>
            <span className="text-ink-muted">·</span>
            <span className="truncate max-w-[18rem] text-ink" title={subject}>
              {subject}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary-deep hover:bg-cream-dark transition-colors"
        >
          {abierto ? 'Ocultar' : 'Ver correo'}
          {abierto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {abierto && (
        <div className="border-t border-border px-2.5 py-2">
          {detalle.isLoading && <p className="text-ink-muted">Cargando…</p>}
          {detalle.error && <p className="text-danger">{detalle.error.message}</p>}
          {detalle.data && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <dt className="text-ink-muted">De</dt>
                <dd className="font-mono break-all">{detalle.data.from}</dd>
                <dt className="text-ink-muted">Para</dt>
                <dd className="font-mono break-all">{detalle.data.to ?? '—'}</dd>
                <dt className="text-ink-muted">Asunto</dt>
                <dd className="font-medium">{detalle.data.subject ?? '—'}</dd>
              </dl>

              <p className="mt-2 whitespace-pre-wrap rounded-md bg-cream-dark/50 p-2 leading-relaxed">
                {detalle.data.body}
              </p>

              <p className="mt-2 text-ink-muted">
                Plantilla{' '}
                <span className="font-mono">
                  {detalle.data.templateCode}
                  {detalle.data.templateVersion ? ` v${detalle.data.templateVersion}` : ''}
                </span>{' '}
                · evento <span className="font-mono">{detalle.data.eventType}</span> · destinatario{' '}
                <span className="font-mono">{detalle.data.recipientRole}</span>
              </p>

              {detalle.data.auditHash && (
                <p className="mt-1 flex items-center gap-1 text-ink-muted">
                  <ShieldCheck size={12} className="text-success shrink-0" />
                  Bitácora #{detalle.data.auditSeq} ·{' '}
                  <span className="font-mono">{detalle.data.auditHash.slice(0, 16)}…</span>
                </p>
              )}

              {deliveryStatus === 'not_configured' && (
                <p className="mt-2 rounded-md border border-border px-2 py-1.5 text-ink-muted">
                  Esto es exactamente lo que se enviaría. No se envió porque falta{' '}
                  <span className="font-mono">RESEND_API_KEY</span>; el sistema lo registra y lo
                  audita, pero no finge haberlo entregado. Al configurar el proveedor, este mismo
                  registro pasa a <span className="font-mono">entregado</span> sin cambiar código.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
