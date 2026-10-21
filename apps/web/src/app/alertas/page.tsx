'use client';

import { Bell, Check, Inbox } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { SkeletonCards } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Chip } from '@/components/ui/chip';
import { DeliveryBadge } from './_delivery-badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AlertasPage() {
  const { data, isLoading, error } = trpc.notifications.recent.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();

  const marcar = trpc.notifications.markAllRead.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: (r) => {
      toast.exito(
        r.marcadas === 0
          ? 'No tenías avisos pendientes.'
          : `${r.marcadas} aviso${r.marcadas === 1 ? '' : 's'} marcado${r.marcadas === 1 ? '' : 's'} como leído${r.marcadas === 1 ? '' : 's'}.`,
      );
      return utils.notifications.recent.invalidate();
    },
  });

  const sinLeer = (data ?? []).filter((n) => n.propia && !n.leida).length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">SLA &amp; Alertas</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              Centro de notificaciones
              {sinLeer > 0 && (
                <Chip
                  label={`${sinLeer} sin leer`}
                  colorClass="bg-primary/10 text-primary-deep"
                  title="Avisos dirigidos a ti que aún no has marcado"
                />
              )}
            </span>
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={() => marcar.mutate()}
                disabled={marcar.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border px-2 py-1 hover:bg-cream-dark disabled:opacity-60"
              >
                <Check size={14} /> Marcar todo leído
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <SkeletonCards count={4} />}
          {error && (
            <p role="alert" className="text-sm text-danger">
              No se pudieron cargar las notificaciones: {error.message}
            </p>
          )}
          {data && data.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox size={28} className="text-ink-muted/50" aria-hidden="true" />
              <p className="text-sm text-ink-muted">Sin notificaciones por ahora.</p>
              <p className="text-xs text-ink-muted/80 max-w-xs">
                Las comunicaciones se generan solas al avanzar un caso o al correr el barrido de
                SLA desde el panel.
              </p>
            </div>
          )}
          {data && data.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {data.map((n) => {
                const pendiente = n.propia && !n.leida;
                return (
                  <li key={n.id} className="flex items-start gap-3 py-2.5">
                    <span
                      className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        pendiente ? 'bg-primary/15 text-primary-deep' : 'bg-cream-dark text-ink-muted'
                      }`}
                    >
                      <Bell size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${pendiente ? 'font-medium' : ''}`}>
                        {n.message}
                        {pendiente && (
                          <span className="sr-only"> (sin leer)</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {new Date(n.createdAt).toLocaleString('es-CO')}
                      </p>
                      {n.templateCode && (
                        <p className="text-xs text-ink-muted flex flex-wrap items-center gap-1.5 mt-1">
                          <Chip label={n.templateCode} title="Plantilla de comunicación" />
                          <Chip
                            label={n.channel === 'email' ? 'Correo' : 'En la app'}
                            colorClass={
                              n.channel === 'email'
                                ? 'bg-teal/10 text-teal-deep'
                                : 'bg-cream-dark text-ink-muted'
                            }
                          />
                          {n.recipientRole && (
                            <Chip label={n.recipientRole} title="Rol destinatario" />
                          )}
                        </p>
                      )}
                      <DeliveryBadge
                        id={n.id}
                        channel={n.channel}
                        deliveryStatus={n.deliveryStatus}
                        recipientEmail={n.recipientEmail}
                        subject={n.subject}
                        sentAt={n.sentAt}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
