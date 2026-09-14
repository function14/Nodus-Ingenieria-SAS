import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function BitacoraPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Bitácora</h1>
      <Card>
        <CardHeader>
          <CardTitle>Registro inmodificable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Trazabilidad completa: actor, acción, estado anterior/nuevo y fecha-hora, sin
            edición ni borrado (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
