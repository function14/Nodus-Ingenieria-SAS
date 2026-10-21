import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './card';

/**
 * Bloque de KPI.
 *
 * Antes los cuatro KPIs se veían idénticos, así que «SLA críticos» —el único
 * que pide una acción— tenía el mismo peso visual que «Cerrados», que es
 * contexto. Un panel donde todo grita lo mismo no jerarquiza nada.
 *
 * `tono` resuelve eso, y nunca con color solo: el estado de alerta añade icono
 * y una línea de texto, porque el color por sí mismo no es información
 * accesible (WCAG 1.4.1). Si el número es 0 el bloque vuelve a ser neutro: una
 * alerta permanente deja de leerse como alerta.
 */
type Tono = 'neutral' | 'alerta';

export function StatBlock({
  label,
  value,
  delta,
  tono = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta?: string;
  tono?: Tono;
  icon?: LucideIcon;
}) {
  const esAlerta = tono === 'alerta';

  return (
    <Card className={`flex flex-col ${esAlerta ? 'border-danger border-2' : ''}`}>
      <CardHeader>
        <CardTitle className="text-ink-muted font-[family-name:var(--font-body)] font-normal normal-case tracking-normal flex items-center gap-1.5">
          {Icon && <Icon size={13} aria-hidden="true" />}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-3xl font-[family-name:var(--font-display)] font-bold ${
            esAlerta ? 'text-danger' : ''
          }`}
        >
          {value}
        </div>
        {delta && (
          <div
            className={`text-xs mt-1 flex items-center gap-1 ${
              esAlerta ? 'text-danger font-medium' : 'text-ink-muted'
            }`}
          >
            {esAlerta && <AlertTriangle size={11} aria-hidden="true" />}
            {delta}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
