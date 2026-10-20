'use client';

import {
  GitCommitHorizontal,
  Mail,
  FileUp,
  FileCheck2,
  Download,
  HelpCircle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Expediente del caso como línea de tiempo.
 *
 * Antes todos los hitos se pintaban con el mismo punto naranja, así que había
 * que leer el texto de cada uno para saber de qué tipo era. Con ~50 entradas en
 * un caso maduro eso es ilegible: el expediente es la prueba de trazabilidad y
 * tiene que poder recorrerse de un vistazo.
 *
 * El color y el icono agrupan por **familia de acción**, no por estado: el
 * color de estado ya lo lleva la cabecera del caso, y repetirlo aquí competiría
 * con la progresión de la escala del workflow.
 */
interface Entrada {
  id: string;
  seq: number;
  action: string;
  fromState: string | null;
  toState: string | null;
  createdAt: Date | string;
  rowHash: string;
  actor: { name: string } | null;
}

const FAMILIA: Record<string, { Icono: LucideIcon; color: string; etiqueta: string }> = {
  CASO_CREADO: { Icono: Sparkles, color: 'text-teal-deep', etiqueta: 'Apertura' },
  CASO_TRANSICION: { Icono: GitCommitHorizontal, color: 'text-ink', etiqueta: 'Transición' },
  COMUNICACION_ENVIADA: { Icono: Mail, color: 'text-ink-muted', etiqueta: 'Comunicación' },
  DOCUMENTO_SUBIDO: { Icono: FileUp, color: 'text-primary-deep', etiqueta: 'Documento' },
  DOCUMENTO_CONFIRMADO: { Icono: FileCheck2, color: 'text-success-deep', etiqueta: 'Documento' },
  DOCUMENTO_DESCARGADO: { Icono: Download, color: 'text-ink-muted', etiqueta: 'Documento' },
  ACLARACION_SOLICITADA: { Icono: HelpCircle, color: 'text-warn-deep', etiqueta: 'Aclaración' },
};

const POR_DEFECTO = { Icono: GitCommitHorizontal, color: 'text-ink-muted', etiqueta: 'Registro' };

export function LineaTiempo({ entradas }: { entradas: Entrada[] }) {
  if (entradas.length === 0) {
    return <p className="text-sm text-ink-muted">El expediente aún no tiene registros.</p>;
  }

  return (
    <ol className="flex flex-col">
      {entradas.map((log, i) => {
        const { Icono, color, etiqueta } = FAMILIA[log.action] ?? POR_DEFECTO;
        const ultimo = i === entradas.length - 1;
        return (
          <li key={log.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 ${color}`}
              >
                <Icono size={12} aria-hidden="true" />
              </span>
              {/* El hilo se corta en el último hito: una línea que sigue
                  sugiere que falta algo por cargar. */}
              {!ultimo && <span className="flex-1 w-px bg-border my-1" />}
            </div>

            <div className={ultimo ? 'pb-1' : 'pb-4'}>
              <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <span>{etiqueta}</span>
                {log.fromState && log.toState && (
                  <span className="text-ink-muted font-normal">
                    {log.fromState} → <span className="text-ink font-medium">{log.toState}</span>
                  </span>
                )}
                {!log.fromState && log.toState && (
                  <span className="text-ink-muted font-normal">{log.toState}</span>
                )}
              </div>

              <div className="text-xs text-ink-muted">
                {log.actor?.name ?? 'Sistema'} · {new Date(log.createdAt).toLocaleString('es-CO')}
              </div>

              {/* Copiable: el hash es la prueba, y antes no había forma de
                  sacarlo para verificarlo fuera de la aplicación. */}
              <button
                type="button"
                title={`Copiar ${log.rowHash}`}
                onClick={() => navigator.clipboard?.writeText(log.rowHash)}
                className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted/70 hover:text-ink transition-colors"
              >
                #{log.seq} · {log.rowHash.slice(0, 16)}…
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
