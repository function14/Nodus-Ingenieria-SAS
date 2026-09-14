import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function PerfilPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Datos del usuario, rol y notificaciones push (módulo en construcción).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}