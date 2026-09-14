import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Outfit, Rubik, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from './providers';

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  display: 'swap',
});

const rubik = Rubik({
  variable: '--font-rubik',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NODUS',
  description: 'Plataforma de orquestación empresarial — 911MiPyme',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#FBF7F0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={`${outfit.variable} ${rubik.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <Providers>
          <OfflineBanner />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
