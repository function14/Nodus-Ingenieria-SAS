interface KanbanCard {
  id: string;
  humanId: string;
  company: string;
  assignee: string | null;
}

interface KanbanColumn {
  status: string;
  name: string;
  color: string | null;
  cards: KanbanCard[];
}

export function KanbanBoard({ columns }: { columns: KanbanColumn[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
      {columns.map((col) => (
        <div key={col.status} className="min-w-[220px] max-w-[260px] flex-1 flex flex-col">
          <div className="rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted flex items-center justify-between border border-border">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
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
                className="bg-surface border border-border rounded-lg p-3 shadow-offset-sm text-sm"
              >
                <div className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                  {card.humanId}
                </div>
                <div className="font-medium mt-1">{card.company}</div>
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
