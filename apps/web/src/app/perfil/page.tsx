'use client';

import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { roles } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
    </div>
  );
}
