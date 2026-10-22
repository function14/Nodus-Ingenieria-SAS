'use client';

import Link from 'next/link';
import { X, Filter } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import {
  CIERRE,
  RESPONSABLE,
  hayFiltroCasos,
  type FiltroCasos,
} from '@/lib/filtro-casos';

/**
 * Barra de filtro activo.
 *
 * Es obligatoria, no decorativa: aterrizar en una lista recortada sin que nada
 * lo diga es la forma más rápida de que alguien concluya que faltan datos. Dice
 * qué se está filtrando, cuántos se ven de cuántos, y da la salida en un clic.
 *
 * La lógica del filtro vive en `@/lib/filtro-casos`, no aquí: así se prueba sin
 * montar React y la lista y los KPIs comparten una sola definición.
 */
export function FiltroActivo({
  filtro,
  mostrados,
  total,
  nombreEstado,
}: {
  filtro: FiltroCasos;
  mostrados: number;
  total: number;
  /** Nombre legible del estado, si el filtro trae uno. */
  nombreEstado?: string | null;
}) {
  if (!hayFiltroCasos(filtro)) return null;

  const etiquetas = [
    filtro.cierre ? CIERRE[filtro.cierre].label : null,
    filtro.estado ? (nombreEstado ?? filtro.estado) : null,
    filtro.responsable ? RESPONSABLE[filtro.responsable].label : null,
  ].filter((e): e is string => e !== null);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-cream-dark/40 px-3 py-2">
      <Filter size={14} className="text-ink-muted shrink-0" aria-hidden="true" />
      <span className="text-xs text-ink-muted">
        Filtrando: mostrando <strong className="text-ink">{mostrados}</strong> de {total} casos
      </span>
      <span className="flex flex-wrap gap-1.5">
        {etiquetas.map((e) => (
          <Chip key={e} label={e} colorClass="bg-primary/10 text-primary-deep" />
        ))}
      </span>
      <Link
        href="/casos"
        className="ml-auto inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-border bg-surface px-2 py-1 hover:bg-cream-dark"
      >
        <X size={12} aria-hidden="true" />
        Quitar filtros
      </Link>
    </div>
  );
}
