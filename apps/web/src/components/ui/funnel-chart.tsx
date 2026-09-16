export function FunnelChart({ data }: { data: { stage: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-muted">Sin datos.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((step) => {
        const pct = (step.value / max) * 100;
        return (
          <div key={step.stage} className="flex items-center gap-3">
            <span className="w-24 text-xs text-ink-muted text-right shrink-0">{step.stage}</span>
            <div className="flex-1">
              <div
                className="h-7 rounded-md bg-primary-deep flex items-center px-2 text-white text-xs font-bold transition-all"
                style={{ width: `${pct}%`, minWidth: '2.5rem' }}
              >
                {step.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
