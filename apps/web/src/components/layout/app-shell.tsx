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
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { sidebarItems, navItems, roleNav, type Role } from '@/lib/constants';
import { RoleSwitcher } from '@/components/ui/role-switcher';

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
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  // La pantalla de login se muestra sin el shell (sidebar / bottom tabs).
  if (pathname === '/login') return <>{children}</>;

  // Vista por rol (D9): cada rol ve solo sus modulos.
  const allowed = role ? roleNav[role] : null;
  const sidebar = allowed ? sidebarItems.filter((i) => allowed.includes(i.href)) : sidebarItems;
  const tabs = allowed ? navItems.filter((i) => allowed.includes(i.href)) : navItems;

  return (
    <div className="flex h-full min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-surface p-4 gap-2 shrink-0">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-[family-name:var(--font-display)] font-bold text-sm">
            N
          </div>
          <span className="font-[family-name:var(--font-display)] font-bold text-lg">NODUS</span>
        </div>
        <RoleSwitcher />
        <nav aria-label="Navegación principal" className="flex flex-col gap-1 mt-4">
          {sidebar.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const active = pathname === item.href;
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
        </nav>
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
          <RoleSwitcher />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-6">{children}</main>

        {/* Mobile bottom tabs */}
        <nav
          aria-label="Navegación inferior"
          className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface flex lg:hidden safe-area-pb"
        >
          {tabs.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const active = pathname === item.href;
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
