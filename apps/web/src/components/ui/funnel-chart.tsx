import { TrendingDown } from 'lucide-react';

/**
 * Embudo de conversión.
 *
 * Dos arreglos frente a la versión anterior:
 *
 * 1. La etiqueta tenía 96px fijos, así que «Cerrado sin contratación» y
 *    «Pendiente de contratación» se cortaban. Ahora la columna da espacio y el
 *    texto puede ocupar dos líneas: una etiqueta truncada obliga a adivinar de
 *    qué etapa habla la barra.
 * 2. Un embudo se lee por la CAÍDA entre pasos, no por la longitud de cada
 *    barra. Antes había 17 barras y ninguna pista de dónde se pierde el flujo;
 *    ahora cada paso muestra cuántos casos no llegaron al siguiente.
 *
 * La caída se deriva de los valores que ya venían: no añade dato nuevo, solo
 * hace visible el que estaba implícito.
 */
export function FunnelChart({ data }: { data: { stage: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-muted">Sin datos.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    // La separación es constante aunque no haya caída: sin ella, dos etapas con
    // el mismo valor se fusionan en un único rectángulo y dejan de leerse como
    // dos pasos distintos.
    <div className="flex flex-col gap-1.5">
      {data.map((step, i) => {
        const pct = (step.value / max) * 100;
        const previo = i > 0 ? data[i - 1].value : null;
        const perdidos = previo !== null ? previo - step.value : 0;
        const caidaPct = previo && previo > 0 ? Math.round((perdidos / previo) * 100) : 0;

        return (
          <div key={step.stage}>
            {/* La caída va ENTRE las barras, que es donde ocurre. */}
            {perdidos > 0 && (
              <div className="flex items-center gap-3 py-0.5">
                <span className="w-32 sm:w-40 shrink-0" aria-hidden="true" />
                <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                  <TrendingDown size={10} aria-hidden="true" />
                  <span className="font-[family-name:var(--font-mono)]">−{perdidos}</span>
                  <span>({caidaPct}% no avanzó)</span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-32 sm:w-40 text-xs text-ink-muted text-right shrink-0 leading-tight">
                {step.stage}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="h-7 rounded-md bg-primary-deep flex items-center px-2 text-white text-xs font-bold transition-all"
                  style={{ width: `${pct}%`, minWidth: '2.5rem' }}
                >
                  {step.value}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
