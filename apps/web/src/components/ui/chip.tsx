/**
 * Etiqueta corta para metadatos: área, complejidad, nivel, disponibilidad.
 *
 * Dos variantes a propósito:
 *
 * - `suave` (por defecto) — fondo tintado y texto oscuro. Es la correcta para
 *   metadatos, que acompañan sin competir, y evita la trampa de contraste del
 *   chip sólido: texto blanco sobre un tono base no llega a 4.5:1.
 * - `solido` — relleno con texto blanco, solo para los tonos `-deep`, que sí
 *   cumplen. Reservado para cuando la etiqueta ES el dato, no su contexto.
 */
type Variante = 'suave' | 'solido';

export function Chip({
  label,
  colorClass = 'bg-cream-dark text-ink-muted',
  variante = 'suave',
  title,
}: {
  label: string;
  /** Clases de color. En `suave`, fondo tintado + texto; en `solido`, relleno. */
  colorClass?: string;
  variante?: Variante;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
        variante === 'solido' ? `text-white ${colorClass}` : colorClass
      }`}
    >
      {label}
    </span>
  );
}
