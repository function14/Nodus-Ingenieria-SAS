'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { TRPCProvider } from '@/lib/trpc/provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <TRPCProvider>{children}</TRPCProvider>
    </SessionProvider>
  );
}
