'use client';

import { X, Briefcase, Send, History } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Chip } from '@/components/ui/chip';
import { SkeletonLines } from '@/components/ui/skeleton';

/**
 * Ficha de un consultor: clasificación, carga de trabajo y trayectoria.
 *
 * El directorio responde «quién hay y en qué estado está». Esto responde la
 * siguiente pregunta, que es la que se hace Advisory antes de asignar: «¿qué
 * tiene entre manos y qué ha hecho?».
 *
 * Panel lateral en vez de página aparte: la decisión se toma mirando la lista,
 * y sacar al usuario de ella para volver enseguida es peor.
 */
const ESTADO_COLOR: Record<string, string> = {
  habilitado: 'bg-success/15 text-success-deep',
  registrado: 'bg-cream-dark text-ink-muted',
  en_validacion: 'bg-warn/15 text-warn-deep',
  condicionado: 'bg-warn/15 text-warn-deep',
  suspendido: 'bg-danger/10 text-danger',
  inactivo: 'bg-cream-dark text-ink-muted',
};

export function FichaConsultor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading, error } = trpc.consultants.byId.useQuery({ userId });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ficha del consultor"
      className="fixed inset-0 z-40 flex justify-end"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20"
      />
      <aside className="relative w-full max-w-md bg-surface border-l border-border h-full overflow-y-auto p-5 flex flex-col gap-4 shadow-offset">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-[family-name:var(--font-display)] font-bold">
              {data?.name ?? 'Consultor'}
            </h2>
            {data?.humanId && (
              <p className="font-[family-name:var(--font-mono)] text-xs text-ink-muted">
                {data.humanId} · {data.email}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha"
            className="rounded-md p-1 text-ink-muted hover:bg-cream-dark transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {isLoading && <SkeletonLines lines={6} />}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {data.status && (
                <Chip
                  label={data.status}
                  colorClass={ESTADO_COLOR[data.status] ?? 'bg-cream-dark text-ink-muted'}
                  title="Estado en el ciclo de vida del consultor"
                />
              )}
              {data.level && <Chip label={data.level} title="Nivel asignado por Advisory" />}
              {data.availability && <Chip label={data.availability} title="Disponibilidad" />}
              {data.specialties.map((e) => (
                <Chip key={e} label={e} colorClass="bg-teal/10 text-teal-deep" title="Especialidad" />
              ))}
              {data.specialties.length === 0 && (
                <Chip
                  label="sin especialidades"
                  colorClass="bg-warn/15 text-warn-deep"
                  title="Sin especialidades declaradas la guarda de la bolsa lo trata como comodín"
                />
              )}
            </div>

            <section>
              <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <Briefcase size={14} className="text-ink-muted" aria-hidden="true" />
                Casos asignados ({data.asignados.length})
              </h3>
              {data.asignados.length === 0 ? (
                <p className="text-xs text-ink-muted">Ninguno ahora mismo.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.asignados.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: c.state.color ?? '#64748B' }}
                        aria-hidden="true"
                      />
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                        {c.humanId}
                      </span>
                      <span className="truncate">{c.company}</span>
                      <span className="text-xs text-ink-muted ml-auto shrink-0">{c.state.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <Send size={14} className="text-ink-muted" aria-hidden="true" />
                Postulaciones ({data.postulaciones.length})
              </h3>
              {data.postulaciones.length === 0 ? (
                <p className="text-xs text-ink-muted">Todavía no se ha postulado a ningún caso.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.postulaciones.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                        {p.humanId}
                      </span>
                      <span className="truncate">{p.company}</span>
                      <span className="text-xs text-ink-muted ml-auto shrink-0">
                        {new Date(p.createdAt).toLocaleDateString('es-CO')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                <History size={14} className="text-ink-muted" aria-hidden="true" />
                Trayectoria
              </h3>
              {data.historial.length === 0 ? (
                <p className="text-xs text-ink-muted">Sin registros.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {data.historial.map((h) => (
                    <li key={h.seq} className="text-xs">
                      <span className="font-medium">{h.action}</span>
                      <span className="text-ink-muted">
                        {' '}
                        · {h.actor} · {new Date(h.createdAt).toLocaleString('es-CO')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
