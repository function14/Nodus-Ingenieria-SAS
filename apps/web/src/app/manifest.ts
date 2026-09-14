import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NODUS',
    short_name: 'NODUS',
    description: 'Plataforma de orquestación empresarial — 911MiPyme',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBF7F0',
    theme_color: '#FBF7F0',
    orientation: 'any',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
