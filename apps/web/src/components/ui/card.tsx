import { type ReactNode } from 'react';

export function Card({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Ancla de la tarjeta. Los KPIs de los paneles enlazan al bloque que explica
   * su cifra, y cuando ese bloque ya está en la misma página el destino es esta
   * tarjeta. El `id` va aquí y no en un `<section>` envolvente porque varias de
   * estas tarjetas son hijas directas de un grid: meter un contenedor en medio
   * les cambiaría el alto.
   */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`bg-surface border border-border rounded-xl shadow-offset-sm ${
        id ? 'scroll-mt-4' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pt-4 pb-2 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`font-[family-name:var(--font-display)] font-bold text-sm ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pb-4 ${className}`}>{children}</div>;
}
