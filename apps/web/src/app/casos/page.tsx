import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function CasosPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Casos</h1>
      <Card>
        <CardHeader>
          <CardTitle>Expediente del caso: NOD-2026-002</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Timeline trazable con estados, adjuntos y decisiones (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}