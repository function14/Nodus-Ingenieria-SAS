/**
 * Marcadores de posición mientras llega la respuesta.
 *
 * Las doce vistas decían «Cargando…» y el contenido aparecía de golpe. Con
 * `staleTime` de 30 s eso hace que saltar entre módulos parpadee en blanco y la
 * aplicación se sienta lenta aunque la consulta tarde 80 ms.
 *
 * La diferencia con un spinner es que aquí la silueta **ya tiene la forma del
 * contenido**: el ojo no tiene que recolocarse cuando llegan los datos.
 */
function Base({ className = '' }: { className?: string }) {
  return <span className={`block rounded-md bg-cream-dark animate-pulse ${className}`} />;
}

/** Filas de tabla. `cols` debe coincidir con las columnas reales de la vista. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  // Anchos desiguales: una rejilla perfectamente uniforme no se lee como texto.
  const anchos = ['w-20', 'w-32', 'w-24', 'w-28', 'w-16', 'w-36'];
  return (
    <div role="status" aria-label="Cargando datos" className="flex flex-col gap-3 py-1">
      <div className="flex gap-4 border-b border-border pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Base key={i} className={`h-3 ${anchos[i % anchos.length]}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Base key={c} className={`h-4 ${anchos[(r + c) % anchos.length]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bloques de indicador del panel de control. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando indicadores"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2">
          <Base className="h-3 w-24" />
          <Base className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Párrafos sueltos: fichas, paneles de detalle. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  const anchos = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4'];
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2 py-1">
      {Array.from({ length: lines }).map((_, i) => (
        <Base key={i} className={`h-4 ${anchos[i % anchos.length]}`} />
      ))}
    </div>
  );
}

/** Listado de tarjetas: bolsa interna, alertas. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-3 flex flex-col gap-2">
          <Base className="h-4 w-1/3" />
          <Base className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
