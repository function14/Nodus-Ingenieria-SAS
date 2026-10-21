import { Lock } from 'lucide-react';

interface KanbanCard {
  id: string;
  humanId: string;
  company: string;
  assignee: string | null;
  /**
   * Caso con la identidad del cliente reservada. La tarjeta debe comunicarlo
   * igual que la tabla: si una vista lo marca y la otra no, el usuario acaba
   * dudando de cuál dice la verdad.
   */
  masked?: boolean;
}

interface KanbanColumn {
  status: string;
  name: string;
  color: string | null;
  cards: KanbanCard[];
}

export function KanbanBoard({
  columns,
  onCardClick,
}: {
  columns: KanbanColumn[];
  /** Si se pasa, la tarjeta se vuelve pulsable y operable con teclado. */
  onCardClick?: (card: KanbanCard) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
      {columns.map((col) => (
        <div key={col.status} className="min-w-[220px] max-w-[260px] flex-1 flex flex-col">
          <div className="rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted flex items-center justify-between border border-border">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: col.color ?? '#64748B' }}
                aria-hidden="true"
              />
              {col.name}
            </span>
            <span className="font-[family-name:var(--font-mono)] bg-cream-dark rounded px-1.5 py-0.5">
              {col.cards.length}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 mt-3">
            {col.cards.map((card) => (
              <div
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
                className={`bg-surface border border-border rounded-lg p-3 shadow-offset-sm text-sm ${
                  onCardClick
                    ? 'cursor-pointer hover:border-border-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
                    : ''
                }`}
              >
                <div className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                  {card.humanId}
                </div>
                {/* Sin emoji: la iconografía operativa es Lucide (§6.3 del doc
                    de diseño). Un emoji además cambia de forma según el sistema. */}
                <div
                  className={`mt-1 flex items-start gap-1.5 ${
                    card.masked ? 'italic text-ink-muted' : 'font-medium'
                  }`}
                >
                  {card.masked && <Lock size={12} className="mt-0.5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 break-words">{card.company}</span>
                </div>
                {card.assignee && <div className="mt-1 text-xs text-ink-muted">{card.assignee}</div>}
              </div>
            ))}
            {col.cards.length === 0 && (
              <div className="text-xs text-ink-muted/60 px-1 py-2">Sin casos</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
