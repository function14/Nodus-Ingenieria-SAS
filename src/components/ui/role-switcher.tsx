'use client';

import { useState } from 'react';
import { roles } from '@/lib/constants';

export function RoleSwitcher() {
  const [active, setActive] = useState(roles[0].id);

  return (
    <div
      role="group"
      aria-label="Cambiar rol de la vista"
      className="flex rounded-lg border border-border overflow-hidden text-[11px] font-medium"
    >
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => setActive(role.id)}
          aria-pressed={active === role.id}
          aria-label={`Ver como ${role.label}`}
          className={`flex-1 px-2 py-1.5 transition-colors whitespace-nowrap ${
            active === role.id ? `${role.activeClass} text-white` : 'bg-surface text-ink-muted hover:bg-cream-dark'
          }`}
        >
          {role.shortLabel}
        </button>
      ))}
    </div>
  );
}
