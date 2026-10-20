'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { TRPCProvider } from '@/lib/trpc/provider';
import { ToastProvider } from '@/components/ui/toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <TRPCProvider>
        <ToastProvider>{children}</ToastProvider>
      </TRPCProvider>
    </SessionProvider>
  );
}
