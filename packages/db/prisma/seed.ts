import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// hash-chain: cada registro encadena el hash del anterior (bitacora a prueba de manipulacion)
function rowHashOf(
  prevHash: string | null,
  rec: {
    seq: number;
    action: string;
    entityType: string;
    entityId: string;
    fromState: string | null;
    toState: string | null;
    payload: unknown;
  },
): string {
  const canonical = JSON.stringify([
    rec.seq,
    rec.action,
    rec.entityType,
    rec.entityId,
    rec.fromState,
    rec.toState,
    rec.payload,
  ]);
  return createHash('sha256')
    .update((prevHash ?? 'GENESIS') + '|' + canonical)
    .digest('hex');
}

async function main() {
  await prisma.slaTimer.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.domainEvent.deleteMany();
  await prisma.case.deleteMany();
  await prisma.company.deleteMany();
  await prisma.slaRule.deleteMany();
  await prisma.templateVersion.deleteMany();
  await prisma.template.deleteMany();
  await prisma.caseTransition.deleteMany();
  await prisma.caseState.deleteMany();
  await prisma.lovItem.deleteMany();
  await prisma.lovGroup.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({ data: { slug: 'nodus', name: '911MiPyme' } });

  const roleData = [
    { code: 'advisory', name: 'Advisory / PMO' },
    { code: 'consultor', name: 'Consultor' },
    { code: 'mipyme', name: 'Mipyme' },
    { code: 'admin', name: 'Administrador' },
    { code: 'system', name: 'Sistema' },
  ];
  const roles: Record<string, string> = {};
  for (const r of roleData) {
    const role = await prisma.role.create({ data: r });
    roles[r.code] = role.id;
  }

  const pwd = bcrypt.hashSync('demo1234', 10);
  const userData = [
    { email: 'advisory@demo.nodus', name: 'Ana Advisory', role: 'advisory' },
    { email: 'consultor@demo.nodus', name: 'Carlos Consultor', role: 'consultor' },
    { email: 'mipyme@demo.nodus', name: 'Maria Mipyme', role: 'mipyme' },
    { email: 'admin@demo.nodus', name: 'Andres Admin', role: 'admin' },
  ];
  const users: Record<string, string> = {};
  for (const u of userData) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: u.email,
        name: u.name,
        passwordHash: pwd,
        roleId: roles[u.role],
      },
    });
    users[u.role] = user.id;
  }

  const lov = [
    { code: 'areas', name: 'Areas', items: ['Estrategia', 'Finanzas', 'Operaciones', 'Marketing', 'Legal', 'Tecnologia'] },
    { code: 'complejidad', name: 'Complejidad', items: ['Baja', 'Media', 'Alta'] },
    { code: 'urgencia', name: 'Urgencia', items: ['Baja', 'Media', 'Alta'] },
    { code: 'impacto', name: 'Impacto', items: ['Bajo', 'Medio', 'Alto'] },
    { code: 'nivel_consultor', name: 'Nivel de consultor', items: ['Junior', 'Semi-Senior', 'Senior'] },
  ];
  for (const g of lov) {
    const group = await prisma.lovGroup.create({ data: { code: g.code, name: g.name } });
    let order = 0;
    for (const label of g.items) {
      order += 1;
      await prisma.lovItem.create({ data: { groupId: group.id, code: slug(label), label, order } });
    }
  }

  const stateData = [
    { code: 'CREADO', name: 'Creado', order: 1, isInitial: true, isTerminal: false, color: '#F97316' },
    { code: 'EN_REVISION', name: 'En revision', order: 2, isInitial: false, isTerminal: false, color: '#7C3AED' },
    { code: 'CLASIFICADO', name: 'Clasificado', order: 3, isInitial: false, isTerminal: false, color: '#0D9488' },
    { code: 'ASIGNADO', name: 'Asignado', order: 4, isInitial: false, isTerminal: false, color: '#64748B' },
    { code: 'EN_EJECUCION', name: 'En ejecucion', order: 5, isInitial: false, isTerminal: false, color: '#CA8A04' },
    { code: 'CERRADO', name: 'Cerrado', order: 6, isInitial: false, isTerminal: true, color: '#16A34A' },
  ];
  const states: Record<string, string> = {};
  for (const s of stateData) {
    const st = await prisma.caseState.create({ data: s });
    states[s.code] = st.id;
  }

  const transitions = [
    { code: 'crear_revision', name: 'Enviar a revision', from: 'CREADO', to: 'EN_REVISION', roles: ['advisory', 'system'] },
    { code: 'clasificar', name: 'Clasificar', from: 'EN_REVISION', to: 'CLASIFICADO', roles: ['advisory'] },
    { code: 'asignar', name: 'Asignar consultor', from: 'CLASIFICADO', to: 'ASIGNADO', roles: ['advisory'] },
    { code: 'autorizar_ejecucion', name: 'Autorizar ejecucion', from: 'ASIGNADO', to: 'EN_EJECUCION', roles: ['advisory'] },
    { code: 'cerrar', name: 'Cerrar caso', from: 'EN_EJECUCION', to: 'CERRADO', roles: ['advisory'] },
  ];
  for (const t of transitions) {
    await prisma.caseTransition.create({
      data: { code: t.code, name: t.name, fromStateId: states[t.from], toStateId: states[t.to], allowedRoles: t.roles },
    });
  }

  const t1 = await prisma.template.create({ data: { code: 'T1', name: 'Onboarding y apertura del caso' } });
  await prisma.templateVersion.create({
    data: {
      templateId: t1.id,
      version: 1,
      jsonSchema: {
        type: 'object',
        required: ['titulo', 'area', 'descripcion'],
        properties: {
          titulo: { type: 'string', title: 'Titulo del caso', minLength: 3 },
          area: { type: 'string', title: 'Area', enum: ['estrategia', 'finanzas', 'operaciones', 'marketing', 'legal', 'tecnologia'] },
          urgencia: { type: 'string', title: 'Urgencia', enum: ['baja', 'media', 'alta'], default: 'media' },
          descripcion: { type: 'string', title: 'Descripcion de la necesidad', minLength: 10 },
        },
      },
      uiSchema: { descripcion: { widget: 'textarea' } },
    },
  });

  const slaData = [
    { stateCode: 'CREADO', hours: 24 },
    { stateCode: 'EN_REVISION', hours: 48 },
    { stateCode: 'CLASIFICADO', hours: 120 },
    { stateCode: 'ASIGNADO', hours: 168 },
    { stateCode: 'EN_EJECUCION', hours: 240 },
  ];
  for (const s of slaData) await prisma.slaRule.create({ data: s });

  const companyNames = ['FoodTech SAS', 'RetailModa', 'Salud Total', 'Ingenieria Nova', 'Comercial Andes', 'Agricola del Sur', 'Transportes Rapidos'];
  const companies: Record<string, string> = {};
  for (const name of companyNames) {
    const c = await prisma.company.create({
      data: { tenantId: tenant.id, name, emailDomain: slug(name).replace(/-/g, '') + '.com' },
    });
    companies[name] = c.id;
  }

  const caseData = [
    { humanId: 'NOD-2026-001', company: 'FoodTech SAS', state: 'CERRADO', assignee: 'consultor' },
    { humanId: 'NOD-2026-002', company: 'RetailModa', state: 'EN_EJECUCION', assignee: 'consultor' },
    { humanId: 'NOD-2026-003', company: 'Salud Total', state: 'CLASIFICADO', assignee: 'consultor' },
    { humanId: 'NOD-2026-004', company: 'Ingenieria Nova', state: 'CLASIFICADO', assignee: null },
    { humanId: 'NOD-2026-005', company: 'Comercial Andes', state: 'CLASIFICADO', assignee: null },
    { humanId: 'NOD-2026-008', company: 'Agricola del Sur', state: 'CREADO', assignee: null },
    { humanId: 'NOD-2026-009', company: 'Transportes Rapidos', state: 'CREADO', assignee: null },
  ];

  let seq = 0;
  let prevHash: string | null = null;
  for (const c of caseData) {
    const created = await prisma.case.create({
      data: {
        tenantId: tenant.id,
        humanId: c.humanId,
        title: 'Diagnostico y acompanamiento - ' + c.company,
        companyId: companies[c.company],
        currentStateId: states[c.state],
        assignedUserId: c.assignee ? users[c.assignee] : null,
      },
    });
    seq += 1;
    const rec = {
      seq,
      action: 'CASO_CREADO',
      entityType: 'Case',
      entityId: created.id,
      fromState: null as string | null,
      toState: 'CREADO',
      payload: { humanId: c.humanId, company: c.company } as unknown,
    };
    const rowHash = rowHashOf(prevHash, rec);
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        seq,
        caseId: created.id,
        actorId: users['advisory'],
        action: rec.action,
        entityType: rec.entityType,
        entityId: rec.entityId,
        fromState: rec.fromState,
        toState: rec.toState,
        payload: rec.payload as object,
        prevHash,
        rowHash,
      },
    });
    prevHash = rowHash;
  }

  console.log('Seed OK:');
  console.log('  tenant:', tenant.slug, '(' + tenant.name + ')');
  console.log('  roles:', Object.keys(roles).length, '| usuarios:', Object.keys(users).length);
  console.log('  estados:', stateData.length, '| transiciones:', transitions.length, '| SLA rules:', slaData.length);
  console.log('  empresas:', companyNames.length, '| casos:', caseData.length);
  console.log('  bitacora hash-chain:', seq, 'registros | ultimo hash:', (prevHash ?? '').slice(0, 16) + '...');
  console.log('  login demo -> advisory@demo.nodus / demo1234 (y consultor@, mipyme@, admin@)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
