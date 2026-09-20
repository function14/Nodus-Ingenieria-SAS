/**
 * Regresiones de tres defectos encontrados revisando F1-F4.
 * Cada bloque fija el comportamiento correcto para que no vuelva a abrirse.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma } from '@nodus/db';
import { MASKED_COMPANY, MASKED_TITLE } from '@nodus/rbac';
import { createObjectStorage, storageConfigFromEnv } from '@nodus/storage';
import { notify } from '@nodus/notifications';
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

let advisory: TestUser;
let consultor: TestUser;
let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirstOrThrow();
  tenantId = tenant.id;
  const load = async (roleCode: string): Promise<TestUser> => {
    const u = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, role: { code: roleCode } },
      orderBy: { email: 'asc' },
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
  // El consultor con caso asignado (hay varios en el seed desde F4).
  const asignado = await prisma.case.findFirst({
    where: { tenantId: tenant.id, assignedUserId: { not: null } },
    select: { assignedUserId: true },
  });
  const cu = await prisma.user.findFirstOrThrow({
    where: asignado?.assignedUserId
      ? { id: asignado.assignedUserId }
      : { tenantId: tenant.id, role: { code: 'consultor' } },
  });
  consultor = {
    id: cu.id,
    role: 'consultor',
    tenantId: cu.tenantId,
    companyId: cu.companyId,
    name: cu.name,
    email: cu.email,
  };
});

/* ------------------------------------------------------------------ */
describe('R1 - la bolsa aplica el mismo masking que /casos (D9, RF-036)', () => {
  it('el consultor no lee la empresa real de un caso que aun no es suyo', async () => {
    const bolsa = await callerFor(consultor).postulations.bolsa();
    expect(bolsa.length).toBeGreaterThan(0);

    for (const b of bolsa) {
      const real = await prisma.case.findUniqueOrThrow({
        where: { id: b.id },
        include: { company: true },
      });
      if (real.assignedUserId === consultor.id) continue;
      expect(b.masked).toBe(true);
      expect(b.company).toBe(MASKED_COMPANY);
      expect(b.company).not.toBe(real.company.name);
      expect(b.title).toBe(MASKED_TITLE);
      // El area y la complejidad SI se muestran: sin ellas no puede decidir
      // si postularse, y no identifican al cliente.
      expect(b).toHaveProperty('area');
      expect(b).toHaveProperty('complejidad');
    }
  });

  it('la bolsa y /casos coinciden para el mismo caso', async () => {
    const bolsa = await callerFor(consultor).postulations.bolsa();
    const lista = await callerFor(consultor).cases.list(undefined);
    for (const b of bolsa) {
      const enLista = lista.find((c) => c.id === b.id);
      if (!enLista) continue;
      expect(b.company).toBe(enLista.company);
    }
  });

  it('advisory sigue viendo la empresa real en la bolsa', async () => {
    const bolsa = await callerFor(advisory).postulations.bolsa();
    for (const b of bolsa) {
      const real = await prisma.case.findUniqueOrThrow({
        where: { id: b.id },
        include: { company: true },
      });
      expect(b.company).toBe(real.company.name);
      expect(b.masked).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
describe('R2 - la clasificacion del consultor la fija Advisory (TC3)', () => {
  it('un consultor habilitado no puede subirse el nivel ni ampliar especialidades', async () => {
    const c = await prisma.consultant.findFirstOrThrow({
      where: { userId: consultor.id },
    });
    expect(c.status).toBe('habilitado');

    await expect(
      callerFor(consultor).consultants.updateMyProfile({
        specialtyCodes: ['finanzas', 'legal', 'estrategia'],
        levelCode: 'senior',
        availability: 'disponible',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const sinCambios = await prisma.consultant.findUniqueOrThrow({ where: { id: c.id } });
    expect(sinCambios.levelCode).toBe(c.levelCode);
    expect(sinCambios.specialtyCodes).toEqual(c.specialtyCodes);
  });

  it('pero si puede cambiar su disponibilidad, que es operativa', async () => {
    const c = await prisma.consultant.findFirstOrThrow({ where: { userId: consultor.id } });
    await callerFor(consultor).consultants.updateMyProfile({
      specialtyCodes: c.specialtyCodes,
      levelCode: c.levelCode as 'junior' | 'semi-senior' | 'senior' | null,
      availability: 'ocupado',
    });
    const tras = await prisma.consultant.findUniqueOrThrow({ where: { id: c.id } });
    expect(tras.availability).toBe('ocupado');

    await callerFor(consultor).consultants.updateMyProfile({
      specialtyCodes: c.specialtyCodes,
      levelCode: c.levelCode as 'junior' | 'semi-senior' | 'senior' | null,
      availability: 'disponible',
    });
  });

  it('advisory si clasifica, y queda en la bitacora', async () => {
    const c = await prisma.consultant.findFirstOrThrow({ where: { userId: consultor.id } });
    await callerFor(advisory).consultants.classify({
      userId: consultor.id,
      specialtyCodes: ['finanzas'],
      levelCode: 'semi-senior',
    });
    const tras = await prisma.consultant.findUniqueOrThrow({ where: { id: c.id } });
    expect(tras.levelCode).toBe('semi-senior');
    expect(tras.specialtyCodes).toEqual(['finanzas']);

    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'CONSULTOR_CLASIFICADO', entityId: c.id },
      orderBy: { seq: 'desc' },
    });
    expect(log).toBeTruthy();

    await callerFor(advisory).consultants.classify({
      userId: consultor.id,
      specialtyCodes: c.specialtyCodes,
      levelCode: c.levelCode as 'junior' | 'semi-senior' | 'senior' | null,
    });
  });

  it('un consultor no puede clasificarse a si mismo', async () => {
    await expect(
      callerFor(consultor).consultants.classify({
        userId: consultor.id,
        specialtyCodes: [],
        levelCode: 'senior',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

/* ------------------------------------------------------------------ */
describe('R3 - una version documental solo cuenta si el servidor la verifica', () => {
  const storage = createObjectStorage(storageConfigFromEnv());

  async function casoDelConsultor() {
    return prisma.case.findFirstOrThrow({ where: { assignedUserId: consultor.id } });
  }

  it('sin subir el archivo, la version no se lista ni se descarga', async () => {
    const kase = await casoDelConsultor();
    const body = 'contenido que nunca se sube';
    const res = await callerFor(consultor).documents.upload({
      caseId: kase.id,
      kind: 'anexo',
      title: 'R3 fantasma',
      mime: 'text/plain',
      sizeBytes: Buffer.byteLength(body),
      checksum: createHash('sha256').update(body).digest('hex'),
      filename: 'fantasma.txt',
    });

    const docs = await callerFor(consultor).documents.list({ caseId: kase.id });
    const fantasma = docs.find((d) => d.title === 'R3 fantasma');
    expect(fantasma?.versions ?? []).toHaveLength(0);

    await expect(
      callerFor(consultor).documents.downloadUrl({
        caseId: kase.id,
        documentId: res.documentId,
        version: res.version,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('con un archivo distinto al declarado, la confirmacion se rechaza', async () => {
    const kase = await casoDelConsultor();
    const declarado = 'contenido declarado';
    const res = await callerFor(consultor).documents.upload({
      caseId: kase.id,
      kind: 'anexo',
      title: 'R3 suplantado',
      mime: 'text/plain',
      sizeBytes: Buffer.byteLength(declarado),
      checksum: createHash('sha256').update(declarado).digest('hex'),
      filename: 'suplantado.txt',
    });

    const dv = await prisma.documentVersion.findFirstOrThrow({
      where: { document: { id: res.documentId }, version: res.version },
    });
    await storage.putObject(dv.objectKey, Buffer.from('OTRO CONTENIDO'), 'text/plain');

    await expect(
      callerFor(consultor).documents.confirm({
        caseId: kase.id,
        documentId: res.documentId,
        version: res.version,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const sinConfirmar = await prisma.documentVersion.findUniqueOrThrow({ where: { id: dv.id } });
    expect(sinConfirmar.confirmedAt).toBeNull();
  });

  it('con el archivo correcto se confirma, se lista y se descarga', async () => {
    const kase = await casoDelConsultor();
    const body = Buffer.from('entregable integro de la regresion');
    const res = await callerFor(consultor).documents.upload({
      caseId: kase.id,
      kind: 'entregable',
      title: 'R3 integro',
      mime: 'text/plain',
      sizeBytes: body.length,
      checksum: createHash('sha256').update(body).digest('hex'),
      filename: 'integro.txt',
    });
    const dv = await prisma.documentVersion.findFirstOrThrow({
      where: { document: { id: res.documentId }, version: res.version },
    });
    await storage.putObject(dv.objectKey, body, 'text/plain');

    const ok = await callerFor(consultor).documents.confirm({
      caseId: kase.id,
      documentId: res.documentId,
      version: res.version,
    });
    expect(ok.confirmed).toBe(true);

    const docs = await callerFor(consultor).documents.list({ caseId: kase.id });
    expect(docs.find((d) => d.title === 'R3 integro')?.versions).toHaveLength(1);

    const url = await callerFor(consultor).documents.downloadUrl({
      caseId: kase.id,
      documentId: res.documentId,
      version: res.version,
    });
    expect(url.url).toContain(dv.objectKey.split('/').pop());

    // Y "Verificar integridad" documental detecta una sustitucion posterior.
    expect((await callerFor(consultor).documents.verify({
      caseId: kase.id,
      documentId: res.documentId,
      version: res.version,
    })).ok).toBe(true);

    await storage.putObject(dv.objectKey, Buffer.from('SUSTITUIDO'), 'text/plain');
    const tras = await callerFor(consultor).documents.verify({
      caseId: kase.id,
      documentId: res.documentId,
      version: res.version,
    });
    expect(tras.ok).toBe(false);
    expect(tras.reason).toBe('alterado');
  });
});

/* ------------------------------------------------------------------ */
describe('R4 - el canal email deja registro comprobable (RT-013)', () => {
  it('una regla en canal email registra destinatario y asunto', async () => {
    const mip = await prisma.user.findFirstOrThrow({ where: { role: { code: 'mipyme' } } });
    const kase = await prisma.case.findFirstOrThrow({ where: { companyId: mip.companyId! } });

    await notify({
      prisma,
      tenantId,
      eventType: 'caso_creado',
      caseId: kase.id,
      actorId: null,
    });

    const email = await prisma.notification.findFirst({
      where: { caseId: kase.id, channel: 'email', templateCode: 'TCOM1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(email).toBeTruthy();
    expect(email!.recipientEmail).toBe(mip.email);
    expect(email!.subject).toContain('Confirmación');
  });

  it('sin proveedor configurado NO se finge el envio', async () => {
    // El registro existe para poder comprobar el canal, pero su estado dice la
    // verdad: 'not_configured', nunca 'sent'.
    const sinEnviar = await prisma.notification.count({
      where: { channel: 'email', deliveryStatus: 'sent', sentAt: null },
    });
    expect(sinEnviar).toBe(0);

    if (!process.env.RESEND_API_KEY) {
      const filas = await prisma.notification.findMany({ where: { channel: 'email' } });
      expect(filas.length).toBeGreaterThan(0);
      for (const f of filas) expect(f.deliveryStatus).toBe('not_configured');
    }
  });

  it('el envio queda encadenado en la bitacora con su destinatario', async () => {
    const email = await prisma.notification.findFirstOrThrow({
      where: { channel: 'email' },
      orderBy: { createdAt: 'desc' },
    });
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'COMUNICACION_ENVIADA', entityId: email.id },
    });
    expect(log).toBeTruthy();
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.channel).toBe('email');
    expect(payload.recipientEmail).toBe(email.recipientEmail);
  });
});
