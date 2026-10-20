'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { SkeletonTable } from './skeleton';

/**
 * Tabla de datos compartida: búsqueda, orden y paginación en un solo sitio.
 *
 * Seis vistas repetían la misma estructura —cabecera, filas, estado vacío— sin
 * ninguna de las tres cosas. Construirlas vista por vista habría significado
 * escribir el mismo filtro cuatro veces y que divergieran, que es justo el
 * error que ya costó caro en la capa de autorización.
 *
 * El filtrado y el orden son en cliente a propósito: los conjuntos de este MVP
 * caben de sobra en memoria, y hacerlo en servidor exigiría paginar también en
 * tRPC sin ganar nada perceptible. Cuando un listado deje de caber, el cambio
 * queda contenido en este componente.
 */
export interface Column<T> {
  /** Identificador de la columna; también la clave de orden por defecto. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Valor por el que ordenar. Sin esto, la columna no es ordenable. */
  sortValue?: (row: T) => string | number;
  /** Alineación a la derecha para cifras. */
  numeric?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  /** Texto sobre el que busca el campo de búsqueda. Sin esto no se muestra. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  error?: { message: string } | null;
  /** Hace la fila entera pulsable. Mantiene el teclado operativo. */
  onRowClick?: (row: T) => void;
  pageSize?: number;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  searchText,
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'No hay registros.',
  isLoading,
  error,
  onRowClick,
  pageSize = 15,
}: DataTableProps<T>) {
  const [consulta, setConsulta] = useState('');
  const [orden, setOrden] = useState<{ key: string; asc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);

  const filtradas = useMemo(() => {
    if (!rows) return [];
    const q = consulta.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, consulta, searchText]);

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas;
    const col = columns.find((c) => c.key === orden.key);
    if (!col?.sortValue) return filtradas;
    // Copia: ordenar in situ mutaría la caché de TanStack Query.
    return [...filtradas].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es');
      return orden.asc ? cmp : -cmp;
    });
  }, [filtradas, orden, columns]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const visibles = ordenadas.slice(paginaActual * pageSize, (paginaActual + 1) * pageSize);

  function alternarOrden(key: string) {
    setPagina(0);
    setOrden((prev) => (prev?.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  }

  if (isLoading) return <SkeletonTable rows={6} cols={columns.length} />;
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!rows || rows.length === 0) return <p className="text-sm text-ink-muted">{emptyMessage}</p>;

  return (
    <div className="flex flex-col gap-3">
      {searchText && (
        <div className="relative max-w-xs">
          <Search
            size={14}
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setPagina(0);
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg border border-border-strong bg-transparent pl-8 pr-2.5 py-1.5 text-sm"
          />
        </div>
      )}

      {ordenadas.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Ningún registro coincide con <span className="font-medium">{consulta}</span>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                {columns.map((c) => {
                  const activa = orden?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={activa ? (orden!.asc ? 'ascending' : 'descending') : 'none'}
                      className={`py-2 pr-3 font-medium ${c.numeric ? 'text-right' : ''}`}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => alternarOrden(c.key)}
                          className={`inline-flex items-center gap-1 hover:text-ink transition-colors ${
                            activa ? 'text-ink' : ''
                          }`}
                        >
                          {c.header}
                          {activa ? (
                            orden!.asc ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )
                          ) : null}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  // La fila pulsable sigue siendo operable con teclado: sin esto
                  // el atajo quedaria solo para raton.
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-border/60 ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-cream-dark/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink'
                      : ''
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-2 pr-3 ${c.numeric ? 'text-right' : ''} ${c.className ?? ''}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span>
            {paginaActual * pageSize + 1}–{Math.min((paginaActual + 1) * pageSize, ordenadas.length)}{' '}
            de {ordenadas.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={paginaActual === 0}
              aria-label="Página anterior"
              className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-cream-dark transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-1">
              {paginaActual + 1} / {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={paginaActual >= totalPaginas - 1}
              aria-label="Página siguiente"
              className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-cream-dark transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
