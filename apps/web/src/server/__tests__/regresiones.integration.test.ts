/**
 * Regresiones de tres defectos encontrados revisando F1-F4.
 * Cada bloque fija el comportamiento correcto para que no vuelva a abrirse.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
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

/* ------------------------------------------------------------------ */
describe('R5 - la vista previa del correo respeta el mismo alcance', () => {
  it('advisory ve el correo completo y su eslabon de bitacora', async () => {
    // El test crea su propio dato: no depende de que otro haya corrido antes.
    const mip = await prisma.user.findFirstOrThrow({ where: { role: { code: 'mipyme' } } });
    const kase = await prisma.case.findFirstOrThrow({ where: { companyId: mip.companyId! } });
    await notify({ prisma, tenantId, eventType: 'caso_creado', caseId: kase.id, actorId: null });

    const email = await prisma.notification.findFirstOrThrow({
      where: { channel: 'email', templateCode: 'TCOM1', caseId: kase.id },
      orderBy: { createdAt: 'desc' },
    });
    const d = await callerFor(advisory).notifications.emailDetail({ id: email.id });
    expect(d.to).toBe(email.recipientEmail);
    expect(d.subject).toContain('Confirmación');
    expect(d.body.length).toBeGreaterThan(10);
    expect(d.templateCode).toBe('TCOM1');
    expect(d.from).toBeTruthy();
    expect(d.auditHash).toBeTruthy(); // quedo encadenada
  });

  it('no se puede abrir el correo de una comunicacion fuera de alcance', async () => {
    const mip = await prisma.user.findFirstOrThrow({ where: { role: { code: 'mipyme' } } });
    const mipUser = {
      id: mip.id,
      role: 'mipyme',
      tenantId: mip.tenantId,
      companyId: mip.companyId,
      name: mip.name,
      email: mip.email,
    };
    // TCOM9 va dirigida a advisory sobre un caso que no es de su empresa.
    const ajena = await prisma.notification.findFirst({
      where: { channel: 'email', case: { companyId: { not: mip.companyId! } } },
    });
    if (!ajena) return; // el seed no siempre deja una asi
    await expect(
      callerFor(mipUser).notifications.emailDetail({ id: ajena.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('una notificacion in-app no se abre como correo', async () => {
    const inApp = await prisma.notification.findFirstOrThrow({ where: { channel: 'in_app' } });
    await expect(
      callerFor(advisory).notifications.emailDetail({ id: inApp.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

/* ------------------------------------------------------------------ */
describe('R6 - alta de consultor y su ciclo hasta ver casos', () => {
  const correo = `alta-${Date.now()}@consultora.test`;
  let nuevoUserId = '';

  it('advisory da de alta un consultor y nace en registrado', async () => {
    const r = await callerFor(advisory).consultants.invite({
      name: 'Laura Restrepo',
      email: correo,
    });
    nuevoUserId = r.userId;
    expect(r.humanId).toMatch(/^CON-\d{6}$/);
    expect(r.passwordTemporal).toHaveLength(12);

    const c = await prisma.consultant.findFirstOrThrow({ where: { userId: r.userId } });
    expect(c.status).toBe('registrado');
    expect(c.specialtyCodes).toEqual([]);
  });

  it('la contrasena temporal sirve para entrar, y no queda en la bitacora', async () => {
    const r = await callerFor(advisory).consultants.invite({
      name: 'Pedro Gomez',
      email: `alta2-${Date.now()}@consultora.test`,
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: r.userId } });
    expect(bcrypt.compareSync(r.passwordTemporal, u.passwordHash)).toBe(true);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONSULTOR_REGISTRADO', tenantId },
      orderBy: { seq: 'desc' },
    });
    expect(JSON.stringify(log.payload)).not.toContain(r.passwordTemporal);
  });

  it('no se puede repetir el correo', async () => {
    await expect(
      callerFor(advisory).consultants.invite({ name: 'Otra Persona', email: correo }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('un consultor no puede dar de alta a otro', async () => {
    await expect(
      callerFor(consultor).consultants.invite({ name: 'X Y', email: `x-${Date.now()}@z.test` }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('recien registrado no ve la bolsa; al clasificarlo y habilitarlo, si', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: nuevoUserId } });
    const comoNuevo = {
      id: u.id, role: 'consultor', tenantId: u.tenantId,
      companyId: u.companyId, name: u.name, email: u.email,
    };

    // En `registrado` la guarda de elegibilidad lo deja fuera por completo.
    expect(await callerFor(comoNuevo).postulations.bolsa()).toHaveLength(0);

    await callerFor(advisory).consultants.classify({
      userId: nuevoUserId, specialtyCodes: ['finanzas'], levelCode: 'senior',
    });
    // Sigue sin ver nada: clasificar no habilita.
    expect(await callerFor(comoNuevo).postulations.bolsa()).toHaveLength(0);

    await callerFor(advisory).consultants.setStatus({ userId: nuevoUserId, status: 'en_validacion' });
    await callerFor(advisory).consultants.setStatus({ userId: nuevoUserId, status: 'habilitado' });

    const bolsa = await callerFor(comoNuevo).postulations.bolsa();
    expect(bolsa.length).toBeGreaterThan(0);
    // Y lo que ve sigue enmascarado: aun no tiene ningun caso asignado.
    for (const b of bolsa) expect(b.masked).toBe(true);
  });
});
