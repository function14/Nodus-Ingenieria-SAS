import { describe, it, expect } from 'vitest';
import { objectKeyFor, storageConfigFromEnv } from './index';

describe('objectKeyFor - ruta logica RT-023 (etapa y version)', () => {
  it('construye empresa/{emp}/caso/{caso}/etapa/{estado}/version/{v}/{nombre}', () => {
    const key = objectKeyFor({
      companyId: 'comp-123',
      caseId: 'caso-abc',
      stateCode: 'EN_EJECUCION',
      version: 2,
      filename: 'entregable-final.pdf',
    });
    expect(key).toBe(
      'empresa/comp-123/caso/caso-abc/etapa/EN_EJECUCION/version/2/entregable-final.pdf',
    );
  });

  it('distintas versiones generan rutas distintas (RF-042, no sobrescribe)', () => {
    const base = { companyId: 'c', caseId: 'k', stateCode: 'EN_EJECUCION', filename: 'doc.pdf' };
    expect(objectKeyFor({ ...base, version: 1 })).not.toBe(objectKeyFor({ ...base, version: 2 }));
  });

  it('sanea nombres con rutas/separadores y caracteres raros', () => {
    const key = objectKeyFor({
      companyId: 'empresa 1/..',
      caseId: 'k',
      stateCode: 'EN_EJECUCION',
      version: 1,
      filename: '../..\\mal:nombre?.pdf',
    });
    expect(key).not.toContain('..');
    expect(key).not.toContain('\\');
    expect(key.toLowerCase()).toContain('mal-nombre-.pdf');
  });
});

describe('storageConfigFromEnv', () => {
  it('usa defaults de MinIO local de nodus cuando no hay entorno', () => {
    const cfg = storageConfigFromEnv({});
    expect(cfg.endPoint).toBe('localhost');
    expect(cfg.port).toBe(9002);
    expect(cfg.useSSL).toBe(false);
    expect(cfg.accessKey).toBe('nodus');
    expect(cfg.secretKey).toBe('nodus-local-secret');
    expect(cfg.bucket).toBe('nodus-docs');
  });

  it('lee MinIO local cuando se configura por entorno', () => {
    const cfg = storageConfigFromEnv({
      MINIO_ENDPOINT: 'minio.internal',
      MINIO_PORT: '9100',
      MINIO_USE_SSL: 'true',
      MINIO_ACCESS_KEY: 'minio-user',
      MINIO_SECRET_KEY: 'minio-secret',
      MINIO_BUCKET: 'nodus-dev',
      MINIO_REGION: 'us-east-1',
    });
    expect(cfg.endPoint).toBe('minio.internal');
    expect(cfg.port).toBe(9100);
    expect(cfg.useSSL).toBe(true);
    expect(cfg.bucket).toBe('nodus-dev');
    expect(cfg.region).toBe('us-east-1');
  });

  it('produccion: derive el endpoint de Cloudflare R2 (decision del cliente)', () => {
    const cfg = storageConfigFromEnv({
      R2_ACCOUNT_ID: '1a2b3c4d5e6f7g8h9i0j',
      R2_ACCESS_KEY_ID: 'AKIA-r2',
      R2_SECRET_ACCESS_KEY: 'super-secret',
      R2_BUCKET: 'nodus-prod',
      R2_REGION: 'auto',
    });
    expect(cfg.endPoint).toBe('1a2b3c4d5e6f7g8h9i0j.r2.cloudflarestorage.com');
    expect(cfg.port).toBe(443);
    expect(cfg.useSSL).toBe(true);
    expect(cfg.bucket).toBe('nodus-prod');
    expect(cfg.region).toBe('auto');
  });
});