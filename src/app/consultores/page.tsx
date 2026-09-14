import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function ConsultoresPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Consultores</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ecosistema de consultores</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Registro, debida diligencia, clasificación y habilitación previa del consultor
            (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
