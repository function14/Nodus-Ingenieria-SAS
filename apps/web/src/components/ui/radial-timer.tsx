export function RadialTimer({
  pct,
  label,
  color,
}: {
  pct: number;
  label: string;
  color: string;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        width="52"
        height="52"
        viewBox="0 0 52 52"
        role="img"
        aria-label={`SLA ${label}: ${pct}% consumido`}
      >
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 26 26)"
          className="transition-all duration-500"
        />
        <text
          x="26"
          y="27"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-ink text-xs font-bold font-[family-name:var(--font-mono)]"
        >
          {pct}%
        </text>
      </svg>
      <span className="text-[10px] text-ink-muted leading-none text-center font-[family-name:var(--font-mono)]">
        {label}
      </span>
    </div>
  );
}
