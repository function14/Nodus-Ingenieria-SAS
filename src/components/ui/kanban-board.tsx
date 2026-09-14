import { kanbanColumns } from '@/lib/mock-data';

export function KanbanBoard() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
      {kanbanColumns.map((col) => (
        <div key={col.status} className="min-w-[220px] max-w-[260px] flex-1 flex flex-col">
          <div
            className={`rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted flex items-center justify-between ${col.colorClass}`}
          >
            <span>{col.status.replace('_', ' ')}</span>
            <span className="font-[family-name:var(--font-mono)] bg-surface/60 rounded px-1.5 py-0.5">
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
                  {card.id}
                </div>
                <div className="font-medium mt-1">{card.company}</div>
                {card.consultantInitials && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${card.roleColorClass}`}
                    >
                      {card.consultantInitials}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
