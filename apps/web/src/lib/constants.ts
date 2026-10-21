export type Role = 'advisory' | 'consultor' | 'mipyme' | 'admin';

export const roles: {
  id: Role;
  label: string;
  shortLabel: string;
  colorClass: string;
  activeClass: string;
}[] = [
  { id: 'advisory', label: 'Advisory / PMO', shortLabel: 'PMO', colorClass: 'bg-advisory', activeClass: 'bg-advisory' },
  { id: 'consultor', label: 'Consultor', shortLabel: 'Consultor', colorClass: 'bg-consultor', activeClass: 'bg-teal-deep' },
  { id: 'mipyme', label: 'Mipyme', shortLabel: 'Mipyme', colorClass: 'bg-mipyme', activeClass: 'bg-primary-deep' },
  { id: 'admin', label: 'Admin', shortLabel: 'Admin', colorClass: 'bg-admin', activeClass: 'bg-admin' },
];

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { label: 'Casos', href: '/casos', icon: 'FolderOpen' },
  { label: 'Bolsa', href: '/bolsa', icon: 'Briefcase' },
  { label: 'Alertas', href: '/alertas', icon: 'Bell' },
  { label: 'Perfil', href: '/perfil', icon: 'User' },
];

/**
 * Sidebar agrupado por dominio. Nueve elementos planos no se escanean: el
 * título del grupo da el contexto y el ojo salta al bloque que busca.
 *
 * Los encabezados solo se muestran cuando hay MÁS DE UN grupo visible:
 * consultor y mipyme solo ven «Operación», y un único título es ruido.
 * El filtrado por rol sigue derivando de @nodus/rbac (allowedRoutes).
 */
export const sidebarGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operación',
    items: [
      // «Panel» y no «Dashboard PMO»: la ruta `/` sirve ahora un panel distinto
      // por rol (Command Center, Workbench, Portal). El título concreto lo pone
      // cada panel en su H1, que es donde no puede confundir.
      { label: 'Panel', href: '/', icon: 'LayoutDashboard' },
      { label: 'Casos', href: '/casos', icon: 'FolderOpen' },
      { label: 'Bolsa interna', href: '/bolsa', icon: 'Briefcase' },
      { label: 'SLA & Alertas', href: '/alertas', icon: 'Bell' },
    ],
  },
  {
    label: 'Directorio',
    items: [
      { label: 'Empresas', href: '/empresas', icon: 'Building2' },
      { label: 'Consultores', href: '/consultores', icon: 'Users' },
    ],
  },
  {
    label: 'Gobierno',
    items: [
      { label: 'Bitácora', href: '/bitacora', icon: 'ScrollText' },
      { label: 'Workflow', href: '/workflow', icon: 'Workflow' },
      { label: 'Configuración', href: '/admin', icon: 'SlidersHorizontal' },
    ],
  },
];

// Las rutas visibles por rol YA NO se definen aquí: se derivan de la tabla de
// permisos en @nodus/rbac (allowedRoutes), para que ocultar un link y bloquear
// el dato no puedan desincronizarse.
