'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  Bell,
  User,
  Building2,
  Users,
  ScrollText,
  Workflow,
  SlidersHorizontal,
  LogOut,
} from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { allowedRoutes } from '@nodus/rbac';
import { sidebarGroups, navItems, roles } from '@/lib/constants';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  Bell,
  User,
  Building2,
  Users,
  ScrollText,
  Workflow,
  SlidersHorizontal,
};

// Estado activo por PREFIJO: al abrir /casos/NOD-2026-002 el enlace "Casos"
// sigue encendido y el menú no pierde la referencia de dónde estás.
// La raíz `/` es el caso aparte: solo coincide exacta, porque como prefijo
// de toda ruta estaría siempre activa.
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const user = session?.user;
  const roleLabel = roles.find((r) => r.id === role)?.label ?? role ?? '—';

  // La pantalla de login se muestra sin el shell (sidebar / bottom tabs).
  if (pathname === '/login') return <>{children}</>;

  // El nav es un REFLEJO de la capa de permisos (@nodus/rbac), no su fuente.
  const allowed = role ? allowedRoutes(role) : null;
  const groups = sidebarGroups
    .map((g) => ({
      ...g,
      items: allowed ? g.items.filter((i) => allowed.includes(i.href)) : g.items,
    }))
    .filter((g) => g.items.length > 0);
  // Un único grupo visible no merece título: consultor y mipyme solo ven
  // «Operación», y un encabezado solitario es ruido.
  const showGroupLabels = groups.length > 1;
  const tabs = allowed ? navItems.filter((i) => allowed.includes(i.href)) : navItems;

  return (
    <div className="flex h-full min-h-screen">
      {/* Accesibilidad: primer enlace focuseable de cada página. Con teclado,
          salta los menús (sidebar + bloque de cuenta) y aterriza directo en el
          contenido. Invisible hasta que recibe foco. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary-deep focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-offset-sm"
      >
        Saltar al contenido
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-surface p-4 gap-2 shrink-0">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-[family-name:var(--font-display)] font-bold text-sm">
            N
          </div>
          <span className="font-[family-name:var(--font-display)] font-bold text-lg">NODUS</span>
        </div>
        {/* `min-h-0 overflow-y-auto`: con nueve enlaces y tres encabezados, en
            una pantalla de portátil baja el menú llegaba a empujar el bloque de
            cuenta fuera de la vista, y con él la única salida de la aplicación.
            Que desborde el menú y no la barra entera. */}
        <nav
          aria-label="Navegación principal"
          className="flex flex-col gap-1 min-h-0 overflow-y-auto"
        >
          {groups.map((group, index) => (
            <div
              key={group.label}
              role="group"
              aria-label={showGroupLabels ? group.label : undefined}
              className={`flex flex-col gap-1 ${index > 0 ? 'mt-4' : ''}`}
            >
              {showGroupLabels && (
                <span className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
                const Icon = iconMap[item.icon] ?? LayoutDashboard;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary-deep'
                        : 'text-ink-muted hover:bg-cream-dark hover:text-ink'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bloque de cuenta: quién eres + salir. En escritorio esta es la única
            salida de la aplicación: /perfil (con su "Cerrar sesión") solo está
            en las tabs móviles, no en el sidebar. */}
        {user && (
          <div className="mt-auto pt-4 border-t border-border flex flex-col gap-1">
            <Link
              href="/perfil"
              // El resto del nav marca la página actual con `aria-current`;
              // este enlace solo la marcaba con color. Quien navega por lector
              // de pantalla no recibe el color.
              aria-current={isActive(pathname, '/perfil') ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive(pathname, '/perfil') ? 'bg-primary/10' : 'hover:bg-cream-dark'
              }`}
            >
              <span className="w-8 h-8 rounded-full bg-primary-deep text-white flex items-center justify-center text-xs font-bold shrink-0">
                {(user.name ?? '?').slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{user.name}</span>
                <span className="block text-xs text-ink-muted truncate">{roleLabel}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-muted hover:bg-cream-dark hover:text-ink transition-colors"
            >
              <LogOut size={18} /> Cerrar sesión
            </button>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface lg:hidden shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-[family-name:var(--font-display)] font-bold text-sm">
              N
            </div>
            <span className="font-[family-name:var(--font-display)] font-bold text-lg">NODUS</span>
          </div>
        </header>

        {/* Page content */}
        <main
          id="contenido"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-6 focus:outline-none"
        >
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav
          aria-label="Navegación inferior"
          className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface flex lg:hidden safe-area-pb"
        >
          {tabs.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? 'text-primary-deep' : 'text-ink-muted'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
