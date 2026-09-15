'use client';

import { Bell } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AlertasPage() {
  const { data, isLoading, error } = trpc.notifications.recent.useQuery();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">SLA &amp; Alertas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Notification Center</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-ink-muted">Cargando notificaciones…</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              No se pudieron cargar las notificaciones: {error.message}
            </p>
          )}
          {data && data.length === 0 && (
            <p className="text-sm text-ink-muted">Sin notificaciones por ahora.</p>
          )}
          {data && data.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {data.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 w-7 h-7 rounded-lg bg-primary/10 text-primary-deep flex items-center justify-center shrink-0">
                    <Bell size={14} />
                  </span>
                  <div>
                    <p className="text-sm">{n.message}</p>
                    <p className="text-xs text-ink-muted">
                      {n.type} · {new Date(n.createdAt).toLocaleString('es-CO')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
