import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AlertasPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">SLA & Alertas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Notification Center</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Bandeja de alertas SLA y notificaciones TCOM (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}