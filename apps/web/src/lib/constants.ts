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

export const navItems = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { label: 'Casos', href: '/casos', icon: 'FolderOpen' },
  { label: 'Bolsa', href: '/bolsa', icon: 'Briefcase' },
  { label: 'Alertas', href: '/alertas', icon: 'Bell' },
  { label: 'Perfil', href: '/perfil', icon: 'User' },
];

export const sidebarItems = [
  { label: 'Dashboard PMO', href: '/', icon: 'LayoutDashboard' },
  { label: 'Casos', href: '/casos', icon: 'FolderOpen' },
  { label: 'Bolsa interna', href: '/bolsa', icon: 'Briefcase' },
  { label: 'Empresas', href: '/empresas', icon: 'Building2' },
  { label: 'Consultores', href: '/consultores', icon: 'Users' },
  { label: 'Bitácora', href: '/bitacora', icon: 'ScrollText' },
  { label: 'SLA & Alertas', href: '/alertas', icon: 'Bell' },
];

// Rutas visibles por rol (vista diferenciada, D9).
export const roleNav: Record<Role, string[]> = {
  advisory: ['/', '/casos', '/bolsa', '/empresas', '/consultores', '/bitacora', '/alertas', '/perfil'],
  admin: ['/', '/casos', '/bolsa', '/empresas', '/consultores', '/bitacora', '/alertas', '/perfil'],
  consultor: ['/casos', '/bolsa', '/alertas', '/perfil'],
  mipyme: ['/casos', '/alertas', '/perfil'],
};
