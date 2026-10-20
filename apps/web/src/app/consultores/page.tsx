'use client';

import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { InvitarConsultor } from './_invitar';

const STATUS_ORDER = ['registrado', 'en_validacion', 'habilitado', 'condicionado', 'suspendido', 'inactivo'];

function StatusSelect({ userId, status }: { userId: string; status: string | null }) {
  const utils = trpc.useUtils();
  const toast = useToast();
  const set = trpc.consultants.setStatus.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: () => {
      toast.exito('Estado del consultor actualizado.');
      return utils.consultants.list.invalidate();
    },
  });

  return (
    <select
      aria-label="Estado del consultor"
      value={status ?? ''}
      disabled={set.isPending}
      onChange={(e) => {
        if (!e.target.value) return;
        set.mutate({ userId, status: e.target.value as never });
      }}
      className="rounded-lg border border-border-strong bg-transparent px-2 py-1 text-xs font-medium"
    >
      <option value="" disabled>—</option>
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

type Consultor = RouterOutputs['consultants']['list'][number];

export default function ConsultoresPage() {
  const { data, isLoading, error } = trpc.consultants.list.useQuery();

  const columns: Column<Consultor>[] = [
    {
      key: 'name',
      header: 'Consultor',
      sortValue: (u) => u.name,
      render: (u) => (
        <span className="inline-flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-teal-deep text-white flex items-center justify-center text-[10px] font-bold shrink-0">
            {u.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            {u.name}
            {u.humanId ? (
              <span className="block text-[11px] text-ink-muted font-[family-name:var(--font-mono)]">
                {u.humanId}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Correo',
      sortValue: (u) => u.email,
      className: 'text-ink-muted font-[family-name:var(--font-mono)] text-[12px]',
      render: (u) => u.email,
    },
    {
      key: 'status',
      header: 'Estado',
      sortValue: (u) => u.status ?? '',
      render: (u) => <StatusSelect userId={u.id} status={u.status} />,
    },
    {
      key: 'level',
      header: 'Nivel',
      sortValue: (u) => u.level ?? '',
      render: (u) => u.level ?? '—',
    },
    {
      key: 'specialties',
      header: 'Especialidades',
      render: (u) => (u.specialties.length > 0 ? u.specialties.join(', ') : '—'),
    },
    {
      key: 'availability',
      header: 'Disp.',
      sortValue: (u) => u.availability ?? '',
      render: (u) => u.availability ?? '—',
    },
    {
      key: 'asignados',
      header: 'Asignados',
      numeric: true,
      sortValue: (u) => u.asignados,
      className: 'font-[family-name:var(--font-mono)]',
      render: (u) => u.asignados,
    },
    {
      key: 'postulaciones',
      header: 'Postulaciones',
      numeric: true,
      sortValue: (u) => u.postulaciones,
      className: 'font-[family-name:var(--font-mono)]',
      render: (u) => u.postulaciones,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Consultores</h1>
      <InvitarConsultor />
      <Card>
        <CardHeader>
          <CardTitle>Ecosistema de consultores habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={data}
            columns={columns}
            getRowKey={(u) => u.id}
            isLoading={isLoading}
            error={error}
            searchText={(u) =>
              `${u.name} ${u.email} ${u.humanId ?? ''} ${u.status ?? ''} ${u.specialties.join(' ')}`
            }
            searchPlaceholder="Buscar por nombre, correo o especialidad…"
            emptyMessage="Aún no hay consultores."
          />
        </CardContent>
      </Card>
    </div>
  );
}
