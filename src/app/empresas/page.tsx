import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function EmpresasPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Empresas</h1>
      <Card>
        <CardHeader>
          <CardTitle>Empresa única</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Registro único por empresa con historial de casos y contactos, y detección de
            duplicados (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
