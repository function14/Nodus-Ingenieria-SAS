import { Client as MinioClient } from 'minio';

/**
 * @nodus/storage — adaptador de almacenamiento S3-compatible (F3).
 *
 * Una sola interfaz delante de MinIO (local) y Cloudflare R2 (produccion, la
 * decision original del cliente; su API es S3-compatible): el archivo NUNCA
 * pasa por el servidor de aplicacion — se firma una URL y el cliente hace
 * PUT/GET directo contra el bucket.
 *
 * Convencion de ruta logica (RT-023, almacenamiento por etapa y version):
 *   empresa/{empId}/caso/{caseId}/etapa/{stateCode}/version/{v}/{filename}
 */

export interface StorageBackend {
  /** Garantiza que el bucket exista (idempotente y cacheado). */
  ensureBucket(): Promise<void>;
  /** URL firmada de subida (PUT). El cliente sube el archivo directo. */
  putObjectUrl(objectKey: string): Promise<string>;
  /** URL firmada de descarga (GET). */
  getObjectUrl(objectKey: string): Promise<string>;
  /**
   * Lee el objeto en el servidor. Lo necesita la confirmacion de subida para
   * recalcular el sha256: un checksum declarado por el cliente y nunca
   * comprobado no es una garantia de integridad, es una nota adhesiva.
   * Devuelve null si el objeto no existe.
   */
  getObject(objectKey: string): Promise<Buffer | null>;
  /** Escribe el objeto desde el servidor (seed y utilidades). */
  putObject(objectKey: string, body: Buffer, mime?: string): Promise<void>;
}

export interface StorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

/** Ruta logica del modelo de negocio: etapa y version SIEMPRE presentes. */
export function objectKeyFor(params: {
  companyId: string;
  caseId: string;
  stateCode: string;
  version: number;
  filename: string;
}): string {
  const { companyId, caseId, stateCode, version, filename } = params;
  return [
    'empresa',
    slug(companyId),
    'caso',
    slug(caseId),
    'etapa',
    slug(stateCode),
    'version',
    String(version),
    sanitizeFilename(filename),
  ].join('/');
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

function sanitizeFilename(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|\0]/g, '-')
    .replace(/\.\.+/g, '.') // nunca secuencias ".." (traversal del objectKey)
    .trim()
    .replace(/^\.+/, ''); // ni segmentos que empiecen con punto
  return base || 'archivo';
}

/** Config desde entorno, con defaults de MinIO local (nodus compose). */
export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  // Produccion: Cloudflare R2 (la decision original del cliente). El endpoint
  // se deriva del accountId; el resto son las credenciales del API token R2.
  if (env.R2_ACCOUNT_ID) {
    return {
      endPoint: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      port: 443,
      useSSL: true,
      accessKey: env.R2_ACCESS_KEY_ID ?? '',
      secretKey: env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: env.R2_BUCKET ?? 'nodus-docs',
      region: env.R2_REGION ?? 'auto',
    };
  }
  // Desarrollo local: MinIO (docker compose de nodus, puerto 9002).
  return {
    endPoint: env.MINIO_ENDPOINT ?? 'localhost',
    port: env.MINIO_PORT ? Number(env.MINIO_PORT) : 9002,
    useSSL: (env.MINIO_USE_SSL ?? 'false') === 'true',
    accessKey: env.MINIO_ACCESS_KEY ?? 'nodus',
    secretKey: env.MINIO_SECRET_KEY ?? 'nodus-local-secret',
    bucket: env.MINIO_BUCKET ?? 'nodus-docs',
    region: env.MINIO_REGION,
  };
}

/**
 * Backend de objetos. El proveedor decidido es **Cloudflare R2**; se habla con
 * el por su API S3-compatible, que es tambien la que expone MinIO, el
 * sustituto de desarrollo local. "S3" aqui nombra el PROTOCOLO, nunca AWS.
 */
export function createObjectStorage(config: StorageConfig): StorageBackend {
  const client = new MinioClient({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region ?? undefined,
  });

  let bucketReady: Promise<void> | null = null;
  function ensureBucketOnce(): Promise<void> {
    bucketReady ??= (async () => {
      const exists = await client.bucketExists(config.bucket);
      if (!exists) await client.makeBucket(config.bucket);
    })();
    return bucketReady;
  }

  return {
    async ensureBucket() {
      await ensureBucketOnce();
    },
    async putObjectUrl(objectKey) {
      await ensureBucketOnce();
      return client.presignedPutObject(config.bucket, objectKey, 15 * 60);
    },
    async getObjectUrl(objectKey) {
      await ensureBucketOnce();
      return client.presignedGetObject(config.bucket, objectKey, 15 * 60);
    },
    async getObject(objectKey) {
      await ensureBucketOnce();
      try {
        const stream = await client.getObject(config.bucket, objectKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks);
      } catch (e) {
        // null significa "el objeto no esta", no "no hay repositorio". Si el
        // almacenamiento es inalcanzable hay que propagarlo: confundir ambos
        // haria que un fallo de configuracion se leyera como un archivo
        // perdido, y se reportaria el problema equivocado.
        const code = (e as { code?: string })?.code ?? '';
        if (code === 'NoSuchKey' || code === 'NotFound' || code === 'NoSuchBucket') return null;
        throw e;
      }
    },
    async putObject(objectKey, body, mime) {
      await ensureBucketOnce();
      await client.putObject(config.bucket, objectKey, body, body.length, {
        'Content-Type': mime ?? 'application/octet-stream',
      });
    },
  };
}