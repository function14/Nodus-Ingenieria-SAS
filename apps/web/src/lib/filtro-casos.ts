/**
 * Filtro de la lista de casos, declarado en la URL.
 *
 * Existe porque los KPIs de los paneles ahora son enlaces, y un KPI que dice
 * «10 casos activos» y te deja en una lista de 14 no es una ayuda: es una
 * contradicción. Cada cifra enlaza al filtro que la reproduce exactamente, y
 * eso está probado en `filtro-casos.integration.test.ts` contra la base: la
 * equivalencia KPI ↔ destino es el contrato de esta pieza.
 *
 * El filtro vive en la URL —no en estado del componente— por tres razones:
 *
 * - El enlace del KPI puede apuntar a él sin que la lista exponga una API.
 * - Se comparte y se guarda en marcadores: «mis casos abiertos» es una
 *   dirección, no una secuencia de clics.
 * - Atrás vuelve de verdad a la vista anterior.
 *
 * Y vive aparte de la barra que lo pinta (`app/casos/_filtros.tsx`) para que
 * sea comprobable sin montar React.
 *
 * El filtrado es en cliente, igual que la búsqueda y el orden de `DataTable` y
 * por el mismo motivo: estos conjuntos caben en memoria y hacerlo en servidor
 * obligaría a paginar en tRPC sin ganar nada visible. Lo que NO se decide aquí
 * es qué estado es final ni de quién es un caso: eso lo responde el servidor
 * (`state.isTerminal`, `mio`), porque son hechos del dominio.
 */

export type Cierre = 'abiertos' | 'cerrados';
export type Responsable = 'mi' | 'asignado' | 'sin-asignar';

export interface FiltroCasos {
  cierre: Cierre | null;
  estado: string | null;
  responsable: Responsable | null;
}

/** Lo mínimo que un caso tiene que exponer para poder filtrarse. */
export interface CasoFiltrable {
  state: { code: string; isTerminal: boolean };
  assignee: string | null;
  mio: boolean;
}

export const CIERRE: Record<Cierre, { label: string; test: (c: CasoFiltrable) => boolean }> = {
  // «Terminal» lo declara el workflow y viaja en el dato: aquí no hay una lista
  // de códigos finales escrita a mano que se quede desfasada cuando
  // Administración añada un cierre.
  abiertos: { label: 'Abiertos', test: (c) => !c.state.isTerminal },
  cerrados: { label: 'Cerrados', test: (c) => c.state.isTerminal },
};

export const RESPONSABLE: Record<
  Responsable,
  { label: string; test: (c: CasoFiltrable) => boolean }
> = {
  mi: { label: 'A mi cargo', test: (c) => c.mio },
  asignado: { label: 'Con responsable', test: (c) => c.assignee !== null },
  'sin-asignar': { label: 'Sin responsable', test: (c) => c.assignee === null },
};

/** Un parámetro desconocido se ignora: una URL manipulada no rompe la vista. */
export function leerFiltroCasos(params: { get: (clave: string) => string | null }): FiltroCasos {
  const cierre = params.get('cierre');
  const responsable = params.get('responsable');
  return {
    cierre: cierre === 'abiertos' || cierre === 'cerrados' ? cierre : null,
    estado: params.get('estado') ?? null,
    responsable:
      responsable === 'mi' || responsable === 'asignado' || responsable === 'sin-asignar'
        ? responsable
        : null,
  };
}

export function aplicarFiltroCasos<T extends CasoFiltrable>(rows: T[], f: FiltroCasos): T[] {
  return rows.filter(
    (c) =>
      (f.cierre === null || CIERRE[f.cierre].test(c)) &&
      (f.estado === null || c.state.code === f.estado) &&
      (f.responsable === null || RESPONSABLE[f.responsable].test(c)),
  );
}

export function hayFiltroCasos(f: FiltroCasos): boolean {
  return f.cierre !== null || f.estado !== null || f.responsable !== null;
}
