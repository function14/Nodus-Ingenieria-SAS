import type { Metadata } from 'next';

// La plantilla del layout raiz le anade " · NODUS".
export const metadata: Metadata = { title: "Bitácora" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
