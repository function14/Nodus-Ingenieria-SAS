import Link from 'next/link';
import { AlertTriangle, ArrowRight, type LucideIcon } from 'lucide-react';
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
 *
 * Con `href` el bloque entero se vuelve el enlace al detalle de su cifra. Tres
 * decisiones que no son cosméticas:
 *
 * - Es un `<a>` de verdad, no un `onClick` sobre el div. Así funcionan el
 *   teclado, la rueda del medio, «abrir en pestaña nueva» y el menú
 *   contextual, que es lo que alguien espera de algo que parece un enlace.
 * - `cta` se MUESTRA, no se insinúa al pasar el ratón. Una tarjeta que solo
 *   revela que es pulsable en hover es invisible en táctil y para quien navega
 *   con teclado.
 * - El nombre accesible del enlace es «etiqueta: valor. cta», porque un lector
 *   de pantalla que anuncia solo «10» no dice a dónde lleva.
 */
type Tono = 'neutral' | 'alerta';

export function StatBlock({
  label,
  value,
  delta,
  tono = 'neutral',
  icon: Icon,
  href,
  cta,
}: {
  label: string;
  value: string | number;
  delta?: string;
  tono?: Tono;
  icon?: LucideIcon;
  /** Destino del detalle de esta cifra. Sin esto el bloque no es pulsable. */
  href?: string;
  /** Texto del enlace: dice a dónde lleva ANTES de hacer clic. */
  cta?: string;
}) {
  const esAlerta = tono === 'alerta';

  const cuerpo = (
    <>
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
    </>
  );

  if (!href || !cta) {
    return (
      <Card className={`flex flex-col ${esAlerta ? 'border-danger border-2' : ''}`}>{cuerpo}</Card>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${cta}`}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <Card
        className={`flex flex-col h-full transition-all group-hover:-translate-x-px group-hover:-translate-y-px group-hover:shadow-offset ${
          esAlerta ? 'border-danger border-2' : 'group-hover:border-border-strong'
        }`}
      >
        {cuerpo}
        <div className="px-4 pb-3 mt-auto">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-deep group-hover:underline"
            aria-hidden="true"
          >
            {cta}
            <ArrowRight
              size={11}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </Card>
    </Link>
  );
}
