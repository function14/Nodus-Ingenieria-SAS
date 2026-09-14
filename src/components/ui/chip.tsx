export function Chip({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${colorClass}`}
    >
      {label}
    </span>
  );
}
