'use client';

import { useSession } from 'next-auth/react';
import { SkeletonKpis } from '@/components/ui/skeleton';
import { CommandCenter } from './_command-center';
import { Workbench } from './_workbench';
import { Portal } from './_portal';

/**
 * `/` - la casa de cada rol.
 *
 * Antes esta ruta ERA el dashboard PMO y a consultor y mipyme se les rebotaba a
 * `/casos` con un `router.replace`: dos de los cuatro roles no tenian panel,
 * entraban a una lista. El encargo pide lo contrario (Command Center para el
 * PMO, Workbench para el consultor, Portal para la mipyme), asi que la ruta
 * elige panel en vez de expulsar.
 *
 * Cada panel es un componente aparte con sus propios hooks, para consultar solo
 * la proyeccion que el rol puede leer. El reparto es de presentacion: la
 * autorizacion real vive en el recurso que protege cada procedure
 * (pmoDashboard / consultorWorkbench / mipymePortal), asi que falsear el rol en
 * el cliente no da acceso al dato, solo pinta un panel vacio.
 */
export default function HomePage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading' || !role) return <SkeletonKpis count={4} />;
  if (role === 'consultor') return <Workbench />;
  if (role === 'mipyme') return <Portal />;
  return <CommandCenter />;
}
