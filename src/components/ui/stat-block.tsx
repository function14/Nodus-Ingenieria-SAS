import { Card, CardHeader, CardTitle, CardContent } from './card';

export function StatBlock({
  label,
  value,
  delta,
}: {
  label: string;
  value: string | number;
  delta?: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-ink-muted font-[family-name:var(--font-body)] font-normal normal-case tracking-normal">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-[family-name:var(--font-display)] font-bold">{value}</div>
        {delta && <div className="text-xs text-ink-muted mt-1">{delta}</div>}
      </CardContent>
    </Card>
  );
}
