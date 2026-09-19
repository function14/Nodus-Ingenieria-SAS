'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { roles } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const AREAS = ['estrategia', 'finanzas', 'operaciones', 'marketing', 'legal', 'tecnologia'];
const NIVELES = ['junior', 'semi-senior', 'senior'];

function PerfilConsultor() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.consultants.my.useQuery();
  const save = trpc.consultants.updateMyProfile.useMutation({
    onSuccess: async () => {
      await utils.consultants.my.invalidate();
      await utils.postulations.bolsa.invalidate();
    },
  });
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [level, setLevel] = useState<'junior' | 'semi-senior' | 'senior' | null>(null);
  const [availability, setAvailability] = useState<'disponible' | 'ocupado'>('disponible');

  useEffect(() => {
    if (data) {
      setSpecialties(data.specialtyCodes ?? []);
      setLevel((data.levelCode ?? null) as 'junior' | 'semi-senior' | 'senior' | null);
      setAvailability((data.availability ?? 'disponible') as 'disponible' | 'ocupado');
    }
  }, [data]);

  const toggle = (code: string) => {
    setSpecialties((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Ficha consultor{' '}
          {data?.humanId ? (
            <span className="text-xs text-ink-muted font-[family-name:var(--font-mono)]">
              {data.humanId}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {isLoading && <p className="text-sm text-ink-muted">Cargando…</p>}
        {data && (
          <p>
            Estado: <strong>{data.status}</strong>
            {data.status === 'habilitado' && data.enabledAt ? (
              <span className="text-xs text-ink-muted">
                {' '}· habilitado {new Date(data.enabledAt).toLocaleDateString('es-CO')}
              </span>
            ) : null}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Especialidades (área del caso que puedes atender)</span>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggle(a)}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                  specialties.includes(a)
                    ? 'bg-teal-deep text-white border-teal-deep'
                    : 'border-border hover:bg-cream-dark'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Nivel</span>
          <select
            value={level ?? ''}
            onChange={(e) =>
              setLevel(e.target.value === '' ? null : (e.target.value as 'junior' | 'semi-senior' | 'senior'))
            }
            className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">— Sin definir —</option>
            {NIVELES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Disponibilidad</span>
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as 'disponible' | 'ocupado')}
            className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="disponible">disponible</option>
            <option value="ocupado">ocupado</option>
          </select>
        </label>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({ specialtyCodes: specialties, levelCode: level, availability })
          }
          className="rounded-lg bg-teal-deep text-white text-sm font-medium px-3 py-2 shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60 w-fit"
        >
          Guardar ficha
        </button>
        {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
      </CardContent>
    </Card>
  );
}

export default function PerfilPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const roleLabel = roles.find((r) => r.id === user?.role)?.label ?? user?.role ?? '—';

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {user ? (
            <>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-primary-deep text-white flex items-center justify-center font-bold">
                  {(user.name ?? '?').slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-sm text-ink-muted font-[family-name:var(--font-mono)]">
                    {user.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted">Rol</span>
                <span className="rounded-full bg-primary/10 text-primary-deep px-2 py-0.5 text-xs font-medium">
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-cream-dark w-fit"
              >
                <LogOut size={16} /> Cerrar sesión
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">No has iniciado sesión.</p>
          )}
        </CardContent>
      </Card>

      {user?.role === 'consultor' && <PerfilConsultor />}
    </div>
  );
}
