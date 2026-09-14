import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function BolsaPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Bolsa interna</h1>
      <Card>
        <CardHeader>
          <CardTitle>Postulaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Deck de casos elegibles con postulación en 1 clic (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}