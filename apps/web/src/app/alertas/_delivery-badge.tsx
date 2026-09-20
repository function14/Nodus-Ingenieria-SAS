/**
 * Registro de envío de una comunicación (RT-013).
 *
 * Existe para que el canal email se pueda comprobar desde la propia
 * aplicación: quién era el destinatario, con qué asunto salió y en qué estado
 * quedó la entrega. Sin esto, verificar el correo exigiría acceso a un buzón.
 */
type Estado = 'sent' | 'failed' | 'pending' | 'not_configured' | string;

const ESTADO: Record<string, { texto: string; clase: string }> = {
  sent: { texto: 'entregado', clase: 'text-success' },
  failed: { texto: 'fallo en el envío', clase: 'text-danger' },
  pending: { texto: 'en cola de envío', clase: 'text-ink-muted' },
  not_configured: { texto: 'sin proveedor configurado', clase: 'text-warning' },
};

export function DeliveryBadge({
  channel,
  deliveryStatus,
  recipientEmail,
  subject,
  sentAt,
}: {
  channel: string;
  deliveryStatus: Estado;
  recipientEmail: string | null;
  subject: string | null;
  sentAt: Date | string | null;
}) {
  if (channel !== 'email') return null;
  const estado = ESTADO[deliveryStatus] ?? { texto: deliveryStatus, clase: 'text-ink-muted' };

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="font-medium text-ink">Correo</span>
        <span className="text-ink-muted">·</span>
        <span className={estado.clase}>{estado.texto}</span>
        {sentAt && (
          <>
            <span className="text-ink-muted">·</span>
            <span className="text-ink-muted">{new Date(sentAt).toLocaleString('es-CO')}</span>
          </>
        )}
      </p>
      {recipientEmail && (
        <p className="mt-0.5 text-ink-muted">
          Para: <span className="font-mono">{recipientEmail}</span>
        </p>
      )}
      {subject && <p className="text-ink-muted">Asunto: {subject}</p>}
      {deliveryStatus === 'not_configured' && (
        <p className="mt-1 text-ink-muted">
          La comunicación quedó registrada y auditada, pero no se envió: falta{' '}
          <span className="font-mono">RESEND_API_KEY</span>. Al configurarla, este mismo
          registro pasa a <span className="font-mono">entregado</span>.
        </p>
      )}
    </div>
  );
}
