'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Avisos efímeros de la aplicación.
 *
 * Existe porque cada vista se había inventado su propio feedback: estados
 * sueltos (`setOk`, `setDocOk`, `setDocError`) y párrafos en línea que
 * aparecían en sitios distintos según la pantalla. Un solo canal hace que la
 * respuesta a una acción se vea siempre igual y en el mismo lugar.
 *
 * Sin dependencias externas a propósito: son ~90 líneas y usa los tokens del
 * sistema, en vez de traer una librería con su propio aspecto que luego habría
 * que re-tematizar.
 */
type Tono = 'exito' | 'error' | 'info';

interface Aviso {
  id: number;
  tono: Tono;
  texto: string;
}

interface ToastApi {
  exito: (texto: string) => void;
  error: (texto: string) => void;
  info: (texto: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ESTILO: Record<Tono, { icono: typeof Info; clase: string }> = {
  exito: { icono: CheckCircle2, clase: 'text-success-deep' },
  error: { icono: AlertTriangle, clase: 'text-danger' },
  info: { icono: Info, clase: 'text-ink-muted' },
};

/** Tiempo en pantalla. Los errores duran más: hay que poder leerlos. */
const DURACION: Record<Tono, number> = { exito: 4000, info: 5000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const cerrar = useCallback((id: number) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const empujar = useCallback(
    (tono: Tono, texto: string) => {
      const id = Date.now() + Math.random();
      setAvisos((prev) => [...prev, { id, tono, texto }]);
      setTimeout(() => cerrar(id), DURACION[tono]);
    },
    [cerrar],
  );

  const api = useMemo<ToastApi>(
    () => ({
      exito: (t) => empujar('exito', t),
      error: (t) => empujar('error', t),
      info: (t) => empujar('info', t),
    }),
    [empujar],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live para que un lector de pantalla anuncie el resultado de la
          acción sin que el foco tenga que moverse hasta aquí. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed z-50 bottom-24 lg:bottom-6 right-4 left-4 lg:left-auto flex flex-col gap-2 pointer-events-none"
      >
        {avisos.map((a) => {
          const { icono: Icono, clase } = ESTILO[a.tono];
          return (
            <div
              key={a.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2 rounded-xl border border-border bg-surface shadow-offset px-3 py-2.5 text-sm lg:max-w-sm lg:ml-auto animate-[toast-in_160ms_ease-out]"
            >
              <Icono size={16} className={`${clase} shrink-0 mt-0.5`} aria-hidden="true" />
              <p className="flex-1 leading-snug">{a.texto}</p>
              <button
                type="button"
                onClick={() => cerrar(a.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded-md p-0.5 text-ink-muted hover:bg-cream-dark transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
