import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Tests de integracion: llaman a los procedures reales contra Postgres.
// Requieren la DB arriba (docker compose up -d db) y el seed cargado.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd(), 'apps/web/src') },
  },
  test: {
    include: ['apps/web/src/**/*.integration.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.integration.ts'],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
