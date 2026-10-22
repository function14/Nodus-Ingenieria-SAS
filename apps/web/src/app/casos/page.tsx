'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { canPerform } from '@nodus/rbac';
import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { SkeletonTable } from '@/components/ui/skeleton';
import { aplicarFiltroCasos, hayFiltroCasos, leerFiltroCasos } from '@/lib/filtro-casos';
import { VistaToggle, useVistaCasos } from './_vista-toggle';
import { FiltroActivo } from './_filtros';

type Caso = RouterOutputs['cases']['list'][number];

function CasosContenido() {
  const { data, isLoading, error } = trpc.cases.list.useQuery();
  const { data: session } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Permite aterrizar aqui ya filtrado desde el directorio de empresas.
  const empresaFiltro = params.get('empresa') ?? '';
  /**
   * Filtro declarado en la URL. Es el destino de los KPIs del panel: cada
   * cifra de arriba enlaza a la lista exacta que esa cifra cuenta.
   */
  const filtro = leerFiltroCasos(params);
  const casos = data ? aplicarFiltroCasos(data, filtro) : undefined;
  // El nombre del estado sale del propio dato, no de un diccionario paralelo.
  const nombreEstado = filtro.estado
    ? (data ?? []).find((c) => c.state.code === filtro.estado)?.state.name ?? null
    : null;
  const [vista, setVista] = useVistaCasos();
  /**
   * Con filtro activo la lista vacía NO dice «aún no hay casos»: diría que no
   * existen cuando lo que pasa es que ninguno cumple el filtro, y manda a
   * buscar un fallo donde no lo hay.
   */
  const vacio = hayFiltroCasos(filtro)
    ? 'Ningún caso cumple el filtro. Quítalo para ver la lista completa.'
    : 'Aún no hay casos registrados.';
  // El boton refleja el permiso real de la capa (no una regla propia de la UI).
  const canCreate = session?.user ? canPerform(session.user, 'case.create') : false;

  const columns: Column<Caso>[] = [
    {
      key: 'humanId',
      header: 'ID',
      sortValue: (c) => c.humanId,
      render: (c) => (
        <Link
          href={`/casos/${c.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-[family-name:var(--font-mono)] text-[12px] text-primary-deep font-medium hover:underline"
        >
          {c.humanId}
        </Link>
      ),
    },
    {
      key: 'company',
      header: 'Empresa',
      sortValue: (c) => c.company,
      render: (c) =>
        c.masked ? (
          <span className="italic text-ink-muted" title="Datos reservados hasta la asignación">
            🔒 {c.company}
          </span>
        ) : (
          c.company
        ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortValue: (c) => c.state.name,
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: c.state.color ?? '#64748B' }}
            aria-hidden="true"
          />
          {c.state.name}
        </span>
      ),
    },
    {
      key: 'assignee',
      header: 'Responsable',
      sortValue: (c) => c.assignee ?? '',
      render: (c) => <span className="text-ink-muted">{c.assignee ?? '—'}</span>,
    },
  ];

  // El pipeline se arma agrupando por estado. El orden de las columnas sale del
  // orden en que aparecen los casos, que ya viene por etapa desde el servidor:
  // asi no hay una segunda definicion del flujo viviendo en la interfaz.
  const columnas = (() => {
    const porEstado = new Map<string, { status: string; name: string; color: string | null; cards: Caso[] }>();
    for (const c of casos ?? []) {
      const clave = c.state.name;
      if (!porEstado.has(clave)) {
        porEstado.set(clave, { status: clave, name: c.state.name, color: c.state.color, cards: [] });
      }
      porEstado.get(clave)!.cards.push(c);
    }
    return [...porEstado.values()].map((col) => ({
      ...col,
      cards: col.cards.map((c) => ({
        id: c.id,
        humanId: c.humanId,
        company: c.company,
        assignee: c.assignee,
        masked: c.masked,
      })),
    }));
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Casos</h1>
        {/* Controles agrupados a la derecha: con justify-between y tres hijos
            sueltos, el selector quedaba flotando en mitad de la cabecera. */}
        <div className="flex items-center gap-2">
          <VistaToggle vista={vista} onChange={setVista} />
          {canCreate && (
            <Link
              href="/casos/nuevo"
              className="rounded-lg bg-primary-deep text-white text-sm font-medium px-3 py-2 shadow-offset-sm transition-transform active:scale-[0.98]"
            >
              + Nuevo caso
            </Link>
          )}
        </div>
      </div>
      {data && (
        <FiltroActivo
          filtro={filtro}
          mostrados={casos?.length ?? 0}
          total={data.length}
          nombreEstado={nombreEstado}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Casos en curso · desde PostgreSQL</CardTitle>
        </CardHeader>
        <CardContent>
          {vista === 'kanban' ? (
            isLoading ? (
              <SkeletonTable rows={4} cols={4} />
            ) : error ? (
              <p role="alert" className="text-sm text-danger">{error.message}</p>
            ) : columnas.length === 0 ? (
              <p className="text-sm text-ink-muted">{vacio}</p>
            ) : (
              <KanbanBoard columns={columnas} onCardClick={(c) => router.push(`/casos/${c.id}`)} />
            )
          ) : (
          <DataTable
            rows={casos}
            columns={columns}
            getRowKey={(c) => c.id}
            isLoading={isLoading}
            error={error}
            // Busca por identificador, empresa, estado y responsable: lo que
            // alguien recuerda de un caso cuando lo busca.
            searchText={(c) => `${c.humanId} ${c.company} ${c.state.name} ${c.assignee ?? ''}`}
            searchPlaceholder="Buscar por ID, empresa o estado…"
            emptyMessage={vacio}
            onRowClick={(c) => router.push(`/casos/${c.id}`)}
            initialSearch={empresaFiltro}
          />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CasosPage() {
  // Suspense obligatorio: useSearchParams() deja la pagina fuera del
  // prerenderizado estatico y Next rechaza el build sin este limite.
  return (
    <Suspense fallback={<SkeletonTable rows={6} cols={4} />}>
      <CasosContenido />
    </Suspense>
  );
}
