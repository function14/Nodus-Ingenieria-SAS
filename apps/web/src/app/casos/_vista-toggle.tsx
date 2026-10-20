'use client';

import { useEffect, useState } from 'react';
import { Rows3, Columns3 } from 'lucide-react';

export type Vista = 'tabla' | 'kanban';

const CLAVE = 'nodus:casos:vista';

/**
 * Selector de presentación de los casos.
 *
 * La preferencia se recuerda en `localStorage` porque es una comodidad del
 * lector, no estado del dominio: no tiene que viajar al servidor ni compartirse
 * entre usuarios. Todo acceso va en `try/catch` porque en ventana privada, con
 * datos de sitio bloqueados o durante una captura, leerlo puede lanzar; en ese
 * caso simplemente se arranca en tabla.
 */
export function useVistaCasos(): [Vista, (v: Vista) => void] {
  const [vista, setVista] = useState<Vista>('tabla');

  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE);
      if (guardada === 'kanban' || guardada === 'tabla') setVista(guardada);
    } catch {
      /* sin almacenamiento: se queda en tabla */
    }
  }, []);

  function cambiar(v: Vista) {
    setVista(v);
    try {
      window.localStorage.setItem(CLAVE, v);
    } catch {
      /* la vista cambia igual, solo no se recuerda */
    }
  }

  return [vista, cambiar];
}

export function VistaToggle({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  const opciones: { id: Vista; label: string; Icono: typeof Rows3 }[] = [
    { id: 'tabla', label: 'Tabla', Icono: Rows3 },
    { id: 'kanban', label: 'Pipeline', Icono: Columns3 },
  ];

  return (
    <div
      role="group"
      aria-label="Presentación de los casos"
      className="flex rounded-lg border border-border overflow-hidden text-xs font-medium"
    >
      {opciones.map(({ id, label, Icono }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={vista === id}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
            vista === id ? 'bg-ink text-white' : 'bg-surface text-ink-muted hover:bg-cream-dark'
          }`}
        >
          <Icono size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
