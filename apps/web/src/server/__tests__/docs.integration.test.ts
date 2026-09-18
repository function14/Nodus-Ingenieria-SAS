import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma, computeRowHash } from '@nodus/db';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../routers/_app';
import { createCallerFactory } from '../trpc';
import type { Context } from '../context';

const createCaller = createCallerFactory(appRouter);

interface TestUser {
  id: string;
  role: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  email: string;
}

function callerFor(user: TestUser) {
  const ctx = {
    prisma,
    session: { user, expires: new Date(Date.now() + 3_600_000).toISOString() },
  } as unknown as Context;
  return createCaller(ctx);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

let advisory: TestUser;
let consultor: TestUser;
let mipyme: TestUser;
let tenantId: string;

async function expectChainIntegrity() {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { seq: 'asc' },
  });
  expect(logs.length).toBeGreaterThan(0);
  let prev: string | null = null;
  for (const log of logs) {
    expect(log.prevHash).toBe(prev);
    const rec = {
      seq: log.seq,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      fromState: log.fromState,
      toState: log.toState,
      payload: log.payload,
    };
    expect(computeRowHash(prev, rec)).toBe(log.rowHash);
    prev = log.rowHash;
  }
}

async function expectRejected(
  run: () => Promise<unknown>,
  code: 'FORBIDDEN' | 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND',
): Promise<void> {
  let thrown: TRPCError | null = null;
  try {
    await run();
  } catch (e) {
    thrown = e as TRPCError;
  }
  expect(thrown).toBeInstanceOf(TRPCError);
  expect(thrown!.code).toBe(code);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
  tenantId = tenant.id;
  const load = async (roleCode: string): Promise<TestUser> => {
    const u = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, role: { code: roleCode } },
    });
    return {
      id: u.id,
      role: roleCode,
      tenantId: u.tenantId,
      companyId: u.companyId,
      name: u.name,
      email: u.email,
    };
  };
  advisory = await load('advisory');
  consultor = await load('consultor');
  mipyme = await load('mipyme');
});

// Requiere MinIO arriba (docker compose up -d minio). El round-trip usa las
// presigned URLs reales: PUT directo al bucket y GET de vuelta, sin que el
// archivo pase por el servidor (RF-008/041/042, criterio de aceptacion F3).
describe('F3 - repositorio documental (versionado por presigned URL)', () => {
  let uploadedCaseId: string;

  it('subir dos veces el mismo documento produce v1 y v2, y v1 sigue descargable', async () => {
    expect(mipyme.companyId).toBeTruthy();
    const created = await callerFor(advisory).cases.create({
      companyId: mipyme.companyId!,
      data: {
        titulo: 'F3 versionado documental',
        area: 'operaciones',
        urgencia: 'media',
        descripcion: 'Documentos del caso para probar el versionado F3.',
      },
    });
    uploadedCaseId = created.id;
    const input = (version: number) => ({
      caseId: uploadedCaseId,
      kind: 'entregable' as const,
      title: 'Entregable Fase 1',
      mime: 'text/plain',
      sizeBytes: 11 + version,
      checksum: sha256('contenido-' + version),
      filename: 'entregable-fase-1.txt',
    });

    const v1 = await callerFor(advisory).documents.upload(input(1));
    expect(v1.version).toBe(1);
    expect(v1.putUrl).toContain('9002');

    const put1 = await fetch(v1.putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'contenido-1',
    });
    expect(put1.ok).toBe(true);

    const v2 = await callerFor(advisory).documents.upload(input(2));
    expect(v2.version).toBe(2);
    expect(v2.documentId).toBe(v1.documentId);

    const put2 = await fetch(v2.putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'contenido-2',
    });
    expect(put2.ok).toBe(true);

    const list = await callerFor(advisory).documents.list({ caseId: uploadedCaseId });
    expect(list.length).toBe(1);
    expect(list[0].currentVersion).toBe(2);
    expect(list[0].versions.map((v) => v.version)).toEqual([1, 2]);

    // v1 sigue descargable (RF-042 / criterio de aceptacion)
    const d1 = await callerFor(advisory).documents.downloadUrl({
      caseId: uploadedCaseId,
      documentId: v1.documentId,
      version: 1,
    });
    expect(d1.version).toBe(1);
    const get1 = await fetch(d1.url);
    expect(get1.ok).toBe(true);
    expect(await get1.text()).toBe('contenido-1');

    // sin version -> la ultima (v2)
    const d2 = await callerFor(advisory).documents.downloadUrl({
      caseId: uploadedCaseId,
      documentId: v1.documentId,
    });
    expect(d2.version).toBe(2);
    const get2 = await fetch(d2.url);
    expect(await get2.text()).toBe('contenido-2');

    // append-only en la DB: dos filas de version, objectKeys distintos
    const rows = await prisma.documentVersion.findMany({
      where: { documentId: v1.documentId },
      orderBy: { version: 'asc' },
    });
    expect(rows.length).toBe(2);
    expect(rows[0].objectKey).not.toBe(rows[1].objectKey);
    expect(rows[0].objectKey).toContain('etapa/');
    expect(rows[0].objectKey).toContain('version/1/');
    expect(rows[0].checksum).toBe(sha256('contenido-1'));

    // cada subida y cada descarga en la bitacora encadenada
    const uploadLogs = await prisma.auditLog.findMany({
      where: { tenantId, caseId: uploadedCaseId, action: 'DOCUMENTO_SUBIDO' },
    });
    expect(uploadLogs.length).toBe(2);
    const downloadLogs = await prisma.auditLog.findMany({
      where: { tenantId, caseId: uploadedCaseId, action: 'DOCUMENTO_DESCARGADO' },
    });
    expect(downloadLogs.length).toBe(2);
    await expectChainIntegrity();
  });

  it('el entregable subido dispara la comunicacion gobernada TCOM11 (entregable_cargado)', async () => {
    const doc = await prisma.document.findFirstOrThrow({
      where: { caseId: uploadedCaseId, kind: 'entregable', currentVersion: 2 },
    });
    const connected = await prisma.notification.findFirst({
      where: { caseId: doc.caseId, templateCode: 'TCOM11' },
      orderBy: { createdAt: 'desc' },
    });
    expect(connected).toBeTruthy();
    expect(connected!.vars).toBeTruthy();
    expect(connected!.message).toContain('(versión 2)');
  });
});

describe('F3 - permisos documentales (RT-022, reuso de packages/rbac)', () => {
  it('consultor NO asignado recibe FORBIDDEN al pedir lista y URL firmada', async () => {
    const kase = await prisma.case.findFirstOrThrow({
      where: { tenantId, humanId: 'NOD-2026-003' },
      select: { id: true, assignedUserId: true, currentState: { select: { code: true } } },
    });
    expect(kase.assignedUserId).toBeNull();
    expect(kase.currentState.code).toBe('EN_POSTULACION');

    await expectRejected(
      () => callerFor(consultor).documents.list({ caseId: kase.id }),
      'FORBIDDEN',
    );
    await expectRejected(
      () =>
        callerFor(consultor).documents.upload({
          caseId: kase.id,
          kind: 'anexo',
          title: 'Doc ajeno',
          mime: 'text/plain',
          sizeBytes: 5,
          checksum: sha256('aaaaa'),
          filename: 'a.txt',
        }),
      'FORBIDDEN',
    );
    await expectRejected(
      () =>
        callerFor(consultor).documents.downloadUrl({
          caseId: kase.id,
          documentId: 'no-importa',
        }),
      'FORBIDDEN',
    );
  });

  it('la mipyme NO accede a documentos de un caso de otra empresa', async () => {
    const kase = await prisma.case.findFirstOrThrow({
      where: { tenantId, humanId: 'NOD-2026-003' },
      select: { id: true, companyId: true },
    });
    expect(kase.companyId).not.toBe(mipyme.companyId);
    await expectRejected(
      () => callerFor(mipyme).documents.list({ caseId: kase.id }),
      'FORBIDDEN',
    );
  });
});