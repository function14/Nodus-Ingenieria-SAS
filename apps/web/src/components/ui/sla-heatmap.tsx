'use client';

import { slaByStage } from '@/lib/mock-data';

export function SLAHeatmap() {
  const totalMax = Math.max(...slaByStage.map((s) => s.ok + s.warn + s.critical));

  return (
    <div className="flex flex-col gap-2.5">
      {slaByStage.map((row) => {
        const total = row.ok + row.warn + row.critical;
        return (
          <div key={row.stage} className="flex items-center gap-3">
            <span className="w-24 text-xs text-ink-muted text-right shrink-0">{row.stage}</span>
            <div className="flex-1 flex h-5 rounded overflow-hidden border border-border bg-cream-dark">
              <div
                className="bg-success transition-all"
                style={{ width: `${(row.ok / totalMax) * 100}%` }}
              />
              <div
                className="bg-warn transition-all"
                style={{ width: `${(row.warn / totalMax) * 100}%` }}
              />
              <div
                className="bg-danger transition-all"
                style={{ width: `${(row.critical / totalMax) * 100}%` }}
              />
            </div>
            <span className="w-10 text-xs font-[family-name:var(--font-mono)] text-right shrink-0">
              {total}
            </span>
          </div>
        );
      })}
      <div className="flex gap-4 mt-1 text-[10px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-success rounded-sm" /> OK
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-warn rounded-sm" /> Riesgo
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-danger rounded-sm" /> Crítico
        </span>
      </div>
    </div>
  );
}
