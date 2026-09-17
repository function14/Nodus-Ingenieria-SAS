'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc/client';
import { roles } from '@/lib/constants';

// "Ver como" (demo): re-autentica como el usuario demo del rol elegido.
// El rol activo se lee de la sesion real (fuente unica), no de estado local.
export function RoleSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();
  const active = session?.user?.role;
  const [switching, setSwitching] = useState(false);

  async function switchTo(roleId: string) {
    if (roleId === active || switching) return;
    setSwitching(true);
    await signIn('credentials', {
      email: `${roleId}@demo.nodus`,
      password: 'demo1234',
      redirect: false,
    });
    // H1: al cambiar de rol se descarta el cache del rol anterior para que la
    // UI no muestre datos del scope previo mientras refresca.
    await utils.invalidate();
    router.refresh();
    setSwitching(false);
  }

  return (
    <div
      role="group"
      aria-label="Ver como rol (demo)"
      className="flex rounded-lg border border-border overflow-hidden text-[11px] font-medium"
    >
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => switchTo(role.id)}
          disabled={switching}
          aria-pressed={active === role.id}
          aria-label={`Ver como ${role.label}`}
          className={`flex-1 px-2 py-1.5 transition-colors whitespace-nowrap disabled:opacity-60 ${
            active === role.id
              ? `${role.activeClass} text-white`
              : 'bg-surface text-ink-muted hover:bg-cream-dark'
          }`}
        >
          {role.shortLabel}
        </button>
      ))}
    </div>
  );
}
