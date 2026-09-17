import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga DATABASE_URL desde packages/db/.env si no viene ya del entorno.
if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'packages/db/.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    // sin archivo .env: se espera DATABASE_URL en el entorno
  }
}
