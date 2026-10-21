'use client';

import { Lock } from 'lucide-react';

/**
 * Pipeline por fases.
 *
 * Reemplaza al tablero de 17 columnas, que exigía ~4.000px de scroll y dedicaba
 * nueve columnas a decir «Sin casos». Aquí la unidad de lectura es la FASE —seis
 * columnas que caben en pantalla— y el estado exacto no se pierde: va como
 * subtítulo de cada grupo de tarjetas.
 *
 * El criterio es que un tablero de PMO se lee para decidir dónde está atascado
 * el flujo. Eso se responde a nivel de fase; el estado exacto es el detalle que
 * se consulta después, no el que organiza la vista.
 */
interface Tarjeta {
  id: string;
  humanId: string;
  company: string;
  assignee: string | null;
  masked?: boolean;
}

interface Etapa {
  status: string;
  name: string;
  color: string | null;
  cards: Tarjeta[];
}

export interface Fase {
  code: string;
  name: string;
  color: string;
  total: number;
  etapas: Etapa[];
}

export function PhaseBoard({
  fases,
  onCardClick,
}: {
  fases: Fase[];
  /** Si se pasa, la tarjeta se vuelve pulsable y operable con teclado. */
  onCardClick?: (card: Tarjeta) => void;
}) {
  const maximo = Math.max(...fases.map((f) => f.total), 1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {fases.map((fase) => (
        <section key={fase.code} className="flex flex-col min-w-0">
          <header className="flex items-baseline justify-between gap-2 pb-1.5 border-b-2" style={{ borderColor: fase.color }}>
            <h3 className="text-xs font-bold uppercase tracking-wide truncate" title={fase.name}>
              {fase.name}
            </h3>
            <span className="font-[family-name:var(--font-mono)] text-sm font-bold shrink-0">
              {fase.total}
            </span>
          </header>

          {/* Barra de proporción: deja ver de un golpe dónde se acumula el flujo. */}
          <div className="h-1 mt-1 rounded-full bg-cream-dark overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full"
              style={{ width: `${(fase.total / maximo) * 100}%`, backgroundColor: fase.color }}
            />
          </div>

          <div className="flex flex-col gap-3 mt-2.5">
            {fase.total === 0 && (
              <p className="text-[11px] text-ink-muted/70 py-1">Sin casos en esta fase.</p>
            )}

            {fase.etapas
              .filter((e) => e.cards.length > 0)
              .map((etapa) => (
                <div key={etapa.status} className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: etapa.color ?? fase.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate" title={etapa.name}>
                      {etapa.name}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] ml-auto shrink-0">
                      {etapa.cards.length}
                    </span>
                  </p>
                  {etapa.cards.map((card) => (
                    <article
                      key={card.id}
                      onClick={onCardClick ? () => onCardClick(card) : undefined}
                      tabIndex={onCardClick ? 0 : undefined}
                      role={onCardClick ? 'button' : undefined}
                      onKeyDown={
                        onCardClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onCardClick(card);
                              }
                            }
                          : undefined
                      }
                      className={`bg-surface border border-border rounded-lg px-2.5 py-2 shadow-offset-sm ${
                        onCardClick
                          ? 'cursor-pointer hover:border-border-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
                          : ''
                      }`}
                    >
                      <p className="font-[family-name:var(--font-mono)] text-[10px] text-ink-muted">
                        {card.humanId}
                      </p>
                      <p
                        className={`text-xs leading-tight mt-0.5 flex items-start gap-1 ${
                          card.masked ? 'italic text-ink-muted' : 'font-medium'
                        }`}
                      >
                        {card.masked && (
                          <Lock size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 break-words">{card.company}</span>
                      </p>
                      {card.assignee && (
                        <p className="text-[11px] text-ink-muted mt-0.5 truncate">{card.assignee}</p>
                      )}
                    </article>
                  ))}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
