import { PrismaClient } from '@prisma/client';
import { createObjectStorage, objectKeyFor, storageConfigFromEnv } from '@nodus/storage';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { computeRowHash } from '../src/audit';

const prisma = new PrismaClient();

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// hash-chain: la funcion vive en @nodus/db (packages/db/src/audit.ts) y la
// comparten seed, motor de workflow y verifyChain.

async function main() {
await prisma.notification.deleteMany();
  await prisma.slaTimer.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.domainEvent.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.postulation.deleteMany();
  await prisma.case.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.company.deleteMany();
  await prisma.slaRule.deleteMany();
  await prisma.templateVersion.deleteMany();
  await prisma.template.deleteMany();
  await prisma.caseTransition.deleteMany();
  await prisma.caseState.deleteMany();
  await prisma.communicationRule.deleteMany();
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
    { key: 'advisory', email: 'advisory@demo.nodus', name: 'Ana Advisory', role: 'advisory' },
    { key: 'consultor', email: 'consultor@demo.nodus', name: 'Carlos Consultor', role: 'consultor' },
    // Segundo consultor para el ciclo de vida del consultor (F4): no tiene
    // ficha habilitada hasta que el flujo la habilite (RF-027/028).
    { key: 'consultor2', email: 'consultor2@demo.nodus', name: 'Diana Consultora', role: 'consultor' },
    { key: 'mipyme', email: 'mipyme@demo.nodus', name: 'Maria Mipyme', role: 'mipyme' },
    { key: 'admin', email: 'admin@demo.nodus', name: 'Andres Admin', role: 'admin' },
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
    users[u.key] = user.id;
  }

  const lov = [
    { code: 'areas', name: 'Áreas', items: ['Estrategia', 'Finanzas', 'Operaciones', 'Marketing', 'Legal', 'Tecnología'] },
    { code: 'complejidad', name: 'Complejidad', items: ['Baja', 'Media', 'Alta'] },
    { code: 'urgencia', name: 'Urgencia', items: ['Baja', 'Media', 'Alta'] },
    { code: 'impacto', name: 'Impacto', items: ['Bajo', 'Medio', 'Alto'] },
    { code: 'nivel_consultor', name: 'Nivel de consultor', items: ['Junior', 'Semi-Senior', 'Senior'] },
    { code: 'estado_consultor', name: 'Estado del consultor', items: ['Registrado', 'En validación', 'Habilitado', 'Condicionado', 'Suspendido', 'Inactivo'] },
    { code: 'disponibilidad_consultor', name: 'Disponibilidad del consultor', items: ['Disponible', 'Ocupado'] },
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
    // --- ciclo de vida basico (puntos 1-2) ---
    { code: 'CREADO', name: 'Creado', order: 1, isInitial: true, isTerminal: false, color: '#F97316' },
    { code: 'EN_REVISION', name: 'En revisión', order: 2, isInitial: false, isTerminal: false, color: '#7C3AED' },
    { code: 'CLASIFICADO', name: 'Clasificado', order: 3, isInitial: false, isTerminal: false, color: '#0D9488' },
    // --- punto 3: bolsa interna ---
    { code: 'EN_POSTULACION', name: 'En postulación', order: 4, isInitial: false, isTerminal: false, color: '#0284C7' },
    { code: 'ASIGNADO', name: 'Asignado', order: 5, isInitial: false, isTerminal: false, color: '#64748B' },
    // --- punto 4: diseno ---
    { code: 'PROPUESTA_EN_DISENO', name: 'Propuesta en diseño', order: 6, isInitial: false, isTerminal: false, color: '#6366F1' },
    // --- punto 5: QA ---
    { code: 'PROPUESTA_LISTA_QA', name: 'Propuesta lista para QA', order: 7, isInitial: false, isTerminal: false, color: '#8B5CF6' },
    // --- punto 6: envio y decision ---
    { code: 'PROPUESTA_ENVIADA', name: 'Propuesta enviada', order: 8, isInitial: false, isTerminal: false, color: '#0891B2' },
    { code: 'EN_DECISION_CLIENTE', name: 'En decisión del cliente', order: 9, isInitial: false, isTerminal: false, color: '#D97706' },
    { code: 'AJUSTES_DE_PROPUESTA', name: 'Ajustes de propuesta', order: 10, isInitial: false, isTerminal: false, color: '#B45309' },
    { code: 'PROPUESTA_ACEPTADA', name: 'Propuesta aceptada', order: 11, isInitial: false, isTerminal: false, color: '#16A34A' },
    // --- punto 7: contratacion ---
    { code: 'PENDIENTE_CONTRATACION', name: 'Pendiente de contratación', order: 12, isInitial: false, isTerminal: false, color: '#4D7C0F' },
    { code: 'AUTORIZADO_EJECUCION', name: 'Autorizado para ejecución', order: 13, isInitial: false, isTerminal: false, color: '#A16207' },
    // --- punto 8: ejecucion ---
    { code: 'EN_EJECUCION', name: 'En ejecución', order: 14, isInitial: false, isTerminal: false, color: '#CA8A04' },
    // --- punto 9: cierre ---
    { code: 'LISTO_PARA_CIERRE', name: 'Listo para cierre', order: 15, isInitial: false, isTerminal: false, color: '#65A30D' },
    { code: 'CERRADO_SIN_CONTRATACION', name: 'Cerrado sin contratación', order: 16, isInitial: false, isTerminal: true, color: '#78716C' },
    { code: 'CERRADO', name: 'Cerrado', order: 17, isInitial: false, isTerminal: true, color: '#16A34A' },
  ];
  const states: Record<string, string> = {};
  for (const s of stateData) {
    const st = await prisma.caseState.create({ data: s });
    states[s.code] = st.id;
  }

  const transitions = [
    // punto 1-2: apertura y revision
    { code: 'devolver_a_cliente', name: 'Devolver a la empresa (ampliación de información)', from: 'EN_REVISION', to: 'CREADO', roles: ['advisory'], guards: [], effects: { commEvents: ['solicitud_aclaracion'] } },
    { code: 'crear_revision', name: 'Enviar a revisión', from: 'CREADO', to: 'EN_REVISION', roles: ['advisory', 'system'], guards: [], effects: { commEvents: ['caso_en_revision'] } },
    { code: 'clasificar', name: 'Clasificar', from: 'EN_REVISION', to: 'CLASIFICADO', roles: ['advisory'], guards: [], effects: { commEvents: ['caso_habilitado_postulacion'] } },
    { code: 'reclasificar', name: 'Reclasificar', from: 'CLASIFICADO', to: 'EN_REVISION', roles: ['advisory'], guards: [], effects: { commEvents: ['caso_en_revision'] } },
    // punto 3: bolsa interna y asignacion
    { code: 'publicar_bolsa', name: 'Publicar en bolsa', from: 'CLASIFICADO', to: 'EN_POSTULACION', roles: ['advisory'], guards: [], effects: { commEvents: ['oportunidad_publicada'] } },
    { code: 'asignar', name: 'Asignar consultor', from: 'EN_POSTULACION', to: 'ASIGNADO', roles: ['advisory'], guards: [], effects: { commEvents: ['consultor_asignado'] } },
    // punto 4-5-6: diseno, QA, envio y decision
    { code: 'iniciar_diseno', name: 'Iniciar diseño de propuesta', from: 'ASIGNADO', to: 'PROPUESTA_EN_DISENO', roles: ['consultor'], guards: [{ type: 'assigneeMustAct' }], effects: { commEvents: ['propuesta_en_diseno'] } },
    { code: 'propuesta_lista_qa', name: 'Propuesta lista para QA', from: 'PROPUESTA_EN_DISENO', to: 'PROPUESTA_LISTA_QA', roles: ['consultor'], guards: [{ type: 'assigneeMustAct' }], effects: { commEvents: ['propuesta_lista_qa'] } },
    { code: 'autorizar_envio_propuesta', name: 'Autorizar envío de propuesta', from: 'PROPUESTA_LISTA_QA', to: 'PROPUESTA_ENVIADA', roles: ['advisory'], guards: [], effects: { commEvents: ['propuesta_enviada'] } },
    { code: 'abrir_periodo_decision', name: 'Abrir período de decisión', from: 'PROPUESTA_ENVIADA', to: 'EN_DECISION_CLIENTE', roles: ['advisory', 'system'], guards: [], effects: { commEvents: ['en_decision_cliente'] } },
    { code: 'solicitar_ajustes', name: 'Solicitar ajustes de propuesta', from: 'EN_DECISION_CLIENTE', to: 'AJUSTES_DE_PROPUESTA', roles: ['mipyme', 'advisory'], guards: [{ type: 'companyOwnerMustAct', role: 'mipyme' }], effects: { commEvents: ['ajustes_propuesta'] } },
    { code: 'reenviar_propuesta', name: 'Reenviar propuesta ajustada', from: 'AJUSTES_DE_PROPUESTA', to: 'PROPUESTA_ENVIADA', roles: ['consultor'], guards: [{ type: 'assigneeMustAct' }], effects: { commEvents: ['propuesta_enviada'] } },
    { code: 'aceptar_propuesta', name: 'Aceptar propuesta', from: 'EN_DECISION_CLIENTE', to: 'PROPUESTA_ACEPTADA', roles: ['mipyme'], guards: [{ type: 'companyOwnerMustAct' }], effects: { commEvents: ['propuesta_aceptada'] } },
    { code: 'cerrar_sin_contratacion', name: 'Cerrar sin contratación', from: 'EN_DECISION_CLIENTE', to: 'CERRADO_SIN_CONTRATACION', roles: ['mipyme', 'advisory'], guards: [{ type: 'companyOwnerMustAct', role: 'mipyme' }], effects: { commEvents: ['cierre_sin_contratacion'] } },
    // punto 7: contratacion y autorizacion
    { code: 'formalizar_contratacion', name: 'Formalizar contratación', from: 'PROPUESTA_ACEPTADA', to: 'PENDIENTE_CONTRATACION', roles: ['advisory'], guards: [], effects: { commEvents: ['contratacion_pendiente'] } },
    { code: 'autorizar_ejecucion', name: 'Autorizar ejecución', from: 'PENDIENTE_CONTRATACION', to: 'AUTORIZADO_EJECUCION', roles: ['advisory'], guards: [], effects: { commEvents: ['autorizado_ejecucion'] } },
    // punto 8: ejecucion
    { code: 'iniciar_ejecucion', name: 'Iniciar ejecución', from: 'AUTORIZADO_EJECUCION', to: 'EN_EJECUCION', roles: ['advisory', 'system'], guards: [], effects: { commEvents: ['inicio_ejecucion'] } },
    // punto 9: cierre
    { code: 'listo_cierre', name: 'Marcar listo para cierre', from: 'EN_EJECUCION', to: 'LISTO_PARA_CIERRE', roles: ['consultor'], guards: [{ type: 'assigneeMustAct' }], effects: { commEvents: ['listo_cierre'] } },
    { code: 'cerrar', name: 'Cerrar / aceptar cierre', from: 'LISTO_PARA_CIERRE', to: 'CERRADO', roles: ['mipyme', 'advisory'], guards: [{ type: 'companyOwnerMustAct', role: 'mipyme' }], effects: { commEvents: ['cierre_caso'] } },
  ];
  for (const t of transitions) {
    await prisma.caseTransition.create({
      data: { code: t.code, name: t.name, fromStateId: states[t.from], toStateId: states[t.to], allowedRoles: t.roles, guards: t.guards, effects: t.effects },
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
          titulo: { type: 'string', title: 'Título del caso', minLength: 3 },
          area: { type: 'string', title: 'Área', enum: ['estrategia', 'finanzas', 'operaciones', 'marketing', 'legal', 'tecnologia'] },
          urgencia: { type: 'string', title: 'Urgencia', enum: ['baja', 'media', 'alta'], default: 'media' },
          complejidad: { type: 'string', title: 'Complejidad', enum: ['baja', 'media', 'alta'], default: 'media' },
          descripcion: { type: 'string', title: 'Descripción de la necesidad', minLength: 10 },
        },
      },
      uiSchema: { descripcion: { widget: 'textarea' } },
    },
  });

  // Plantillas del ciclo del consultor (F4): TC1 registro, TC2 debida
  // diligencia, TC3 clasificacion. Igual que T1, son DATO (jsonSchema) que el
  // flujo de habilitacion rellena; su gobierno tambien es datos.
  const consultingTemplates = [
    {
      code: 'TC1',
      name: 'Registro del consultor',
      jsonSchema: {
        type: 'object',
        required: ['nombre', 'especialidades', 'nivel', 'disponibilidad'],
        properties: {
          nombre: { type: 'string', title: 'Nombre completo', minLength: 3 },
          especialidades: { type: 'array', title: 'Especialidades', minItems: 1, items: { type: 'string', enum: ['estrategia', 'finanzas', 'operaciones', 'marketing', 'legal', 'tecnologia'] } },
          nivel: { type: 'string', title: 'Nivel', enum: ['junior', 'semi-senior', 'senior'] },
          disponibilidad: { type: 'string', title: 'Disponibilidad', enum: ['disponible', 'ocupado'], default: 'disponible' },
        },
      },
      uiSchema: {},
    },
    {
      code: 'TC2',
      name: 'Debida diligencia del consultor',
      jsonSchema: {
        type: 'object',
        required: ['experiencia_anios', 'referencias', 'disponibilidad'],
        properties: {
          experiencia_anios: { type: 'integer', title: 'Años de experiencia', minimum: 0 },
          referencias: { type: 'string', title: 'Referencias', minLength: 5 },
          disponibilidad: { type: 'string', title: 'Disponibilidad', enum: ['disponible', 'ocupado'], default: 'disponible' },
        },
      },
      uiSchema: { referencias: { widget: 'textarea' } },
    },
    {
      code: 'TC3',
      name: 'Clasificación y habilitación',
      jsonSchema: {
        type: 'object',
        required: ['nivel', 'especialidades'],
        properties: {
          nivel: { type: 'string', title: 'Nivel asignado', enum: ['junior', 'semi-senior', 'senior'] },
          especialidades: { type: 'array', title: 'Especialidades habilitadas', minItems: 1, items: { type: 'string', enum: ['estrategia', 'finanzas', 'operaciones', 'marketing', 'legal', 'tecnologia'] } },
        },
      },
      uiSchema: {},
    },
    {
      // RF-035: la solicitud de aclaracion estructurada que la PMO envia a la
      // empresa cuando el caso esta en revision (transicion devolver_a_cliente).
      code: 'T3A',
      name: 'Solicitud de aclaracion estructurada',
      jsonSchema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            title: 'Items de aclaracion',
            minItems: 1,
            items: {
              type: 'object',
              required: ['solicitud'],
              properties: {
                campo: { type: 'string', title: 'Campo referido', maxLength: 80 },
                solicitud: { type: 'string', title: 'Solicitud', minLength: 5, maxLength: 500 },
              },
            },
          },
        },
      },
      uiSchema: {},
    },
  ];
  for (const tpl of consultingTemplates) {
    const t = await prisma.template.create({ data: { code: tpl.code, name: tpl.name, kind: 'form' } });
    await prisma.templateVersion.create({
      data: { templateId: t.id, version: 1, jsonSchema: tpl.jsonSchema, uiSchema: tpl.uiSchema },
    });
  }

  // Plantillas de comunicaciones gobernadas (F1): viven como DATO, nunca como
  // literales en el codigo del motor.
  //
  // TCOM1-TCOM12 son las doce que nombra el BluePrint Operativo del cliente.
  // TCOM13 ("Aviso interno de proceso") NO esta en el encargo: se anade como
  // comodin para los avisos internos a advisory que el documento exige
  // comunicar pero para los que no define plantilla propia. Queda declarada
  // aqui para que no aparezca como plantilla fantasma al cruzar con la matriz.
  // El motor las renderiza con las variables del evento.
  const commTemplates = [
    {
      code: 'TCOM1',
      name: 'Confirmación de recepción del caso',
      subject: 'Confirmación de recepción — caso {humanId}',
      body: 'Estimada empresa {empresa}, su caso {humanId} fue recibido correctamente por 911MiPyme y se encuentra en estado {estado}. Puede seguir su avance en la plataforma. — NODUS / 911MiPyme',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM2',
      name: 'Solicitud de información adicional',
      subject: 'Solicitud de información adicional — caso {humanId}',
      body: 'Estimada empresa {empresa}, para continuar con el caso {humanId} necesitamos la siguiente información: {solicitud}. Le pedimos responder a la brevedad. — NODUS / 911MiPyme',
      variables: ['humanId', 'empresa', 'solicitud'],
    },
    {
      code: 'TCOM3',
      name: 'Caso habilitado para postulación',
      subject: 'Caso habilitado para postulación — {humanId}',
      body: 'El caso {humanId} de {empresa} fue clasificado y habilitado para postulación. Estado actual: {estado}.',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM4',
      name: 'Nueva oportunidad disponible',
      subject: 'Nueva oportunidad disponible — {humanId}',
      body: 'Consultora o consultor: el caso {humanId} de {empresa} está disponible en la bolsa interna de casos. Si le interesa, puede postularse desde la plataforma antes del cierre de la bolsa.',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM5',
      name: 'Asignación de consultor',
      subject: 'Asignación de caso — {humanId}',
      body: 'Le confirmamos la asignación del caso {humanId} ({empresa}). El caso se encuentra en estado {estado}. Conozca los detalles y acuerde los próximos pasos.',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM6',
      name: 'Actualización de propuesta',
      subject: 'Actualización de propuesta — {humanId}',
      body: 'La propuesta del caso {humanId} ({empresa}) {hito}. Estado actual del caso: {estado}.',
      variables: ['humanId', 'empresa', 'estado', 'hito'],
    },
    {
      code: 'TCOM7',
      name: 'Observaciones a la propuesta',
      subject: 'Observaciones a propuesta — {humanId}',
      body: 'La propuesta del caso {humanId} recibió observaciones: {observacion}. Por favor ajústela y registre la nueva versión en la plataforma.',
      variables: ['humanId', 'empresa', 'observacion'],
    },
    {
      code: 'TCOM8',
      name: 'Recordatorio de SLA',
      subject: 'Recordatorio de SLA — caso {humanId}',
      body: 'Recordatorio: el caso {humanId} en la etapa {etapa} tiene un compromiso de atención antes de {plazo}. Por favor atiéndalo para evitar el escalamiento.',
      variables: ['humanId', 'empresa', 'etapa', 'plazo', 'estado'],
    },
    {
      code: 'TCOM9',
      name: 'Alerta de SLA vencido',
      subject: 'SLA vencido — caso {humanId}',
      body: 'Alerta: el caso {humanId} en la etapa {etapa} venció su SLA de atención. El caso fue escalado{escalaAviso}. Se requiere acción inmediata del equipo.',
      variables: ['humanId', 'empresa', 'etapa', 'escalaAviso'],
    },
    {
      code: 'TCOM10',
      name: 'Inicio de ejecución',
      subject: 'Inicio de ejecución — caso {humanId}',
      body: 'El caso {humanId} de {empresa} inició su etapa de ejecución. Estado actual: {estado}.',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM11',
      name: 'Entregable cargado',
      subject: 'Entregable cargado — caso {humanId}',
      body: 'Se cargó el entregable {entregable} (versión {version}) del caso {humanId} ({empresa}). El documento queda en revisión de calidad.',
      variables: ['humanId', 'empresa', 'entregable', 'version'],
    },
    {
      code: 'TCOM12',
      name: 'Cierre de caso y evaluación',
      subject: 'Cierre de caso — {humanId}',
      body: 'El caso {humanId} de {empresa} fue cerrado. Le invitamos a diligenciar la evaluación de la experiencia en la plataforma. Su opinión es valiosa.',
      variables: ['humanId', 'empresa', 'estado'],
    },
    {
      code: 'TCOM13',
      name: 'Aviso interno de proceso',
      subject: 'Aviso de proceso — caso {humanId}',
      body: 'Aviso interno: el caso {humanId} ({empresa}) registra el evento {evento}. Estado actual: {estado}.',
      variables: ['humanId', 'empresa', 'evento', 'estado'],
    },
  ];
  for (const tpl of commTemplates) {
    const t = await prisma.template.create({
      data: { code: tpl.code, name: tpl.name, kind: 'communication' },
    });
    await prisma.templateVersion.create({
      data: {
        templateId: t.id,
        version: 1,
        jsonSchema: {},
        subject: tpl.subject,
        body: tpl.body,
        variables: tpl.variables,
      },
    });
  }

  // Reglas de comunicacion: evento -> plantilla -> destinatario -> canal.
  // Quien ve que lo decide RBAC; aqui SOLO se declara la gobernanza por dato.
  // [eventType, templateCode, recipientRole, channel]
  const commRules: Array<[string, string, string | null, string]> = [
    // Estos dos van por EMAIL a proposito: son los que dispara el recorrido
    // guiado del README (crear un caso y 'Revisar SLA'), de modo que el canal
    // se puede comprobar sin conocer el sistema por dentro.
    ['caso_creado', 'TCOM1', 'mipyme', 'email'],
    ['caso_en_revision', 'TCOM13', 'advisory', 'in_app'],
    ['solicitud_aclaracion', 'TCOM2', 'mipyme', 'in_app'],
    ['caso_habilitado_postulacion', 'TCOM3', 'advisory', 'in_app'],
    ['oportunidad_publicada', 'TCOM4', 'consultor', 'in_app'],
    ['postulacion_recibida', 'TCOM13', 'advisory', 'in_app'],
    ['consultor_asignado', 'TCOM5', 'consultor', 'in_app'],
    ['consultor_asignado', 'TCOM5', 'mipyme', 'in_app'],
    ['propuesta_en_diseno', 'TCOM13', 'advisory', 'in_app'],
    ['observaciones_propuesta', 'TCOM7', 'consultor', 'in_app'],
    ['propuesta_enviada', 'TCOM6', 'mipyme', 'in_app'],
    ['propuesta_aceptada', 'TCOM6', 'consultor', 'in_app'],
    ['propuesta_rechazada', 'TCOM6', 'consultor', 'in_app'],
    ['contratacion_pendiente', 'TCOM13', 'advisory', 'in_app'],
    ['contratacion_pendiente', 'TCOM6', 'mipyme', 'in_app'],
    ['inicio_ejecucion', 'TCOM10', 'mipyme', 'in_app'],
    ['inicio_ejecucion', 'TCOM10', 'consultor', 'in_app'],
    ['hito_proximo_a_vencer', 'TCOM8', 'consultor', 'in_app'],
    ['entregable_cargado', 'TCOM11', 'advisory', 'in_app'],
    ['entregable_cargado', 'TCOM11', 'mipyme', 'in_app'],
    ['entregable_en_qa', 'TCOM13', 'advisory', 'in_app'],
    ['documento_subido', 'TCOM13', 'advisory', 'in_app'],
    ['cierre_caso', 'TCOM12', 'mipyme', 'in_app'],
    ['evaluacion_disponible', 'TCOM12', 'mipyme', 'in_app'],
    ['ajustes_propuesta', 'TCOM7', 'consultor', 'in_app'],
    ['propuesta_lista_qa', 'TCOM13', 'advisory', 'in_app'],
    ['autorizado_ejecucion', 'TCOM13', 'advisory', 'in_app'],
    ['listo_cierre', 'TCOM13', 'advisory', 'in_app'],
    ['cierre_sin_contratacion', 'TCOM13', 'advisory', 'in_app'],
    ['cierre_sin_contratacion', 'TCOM6', 'mipyme', 'in_app'],
    ['sla_warn', 'TCOM8', 'consultor', 'in_app'],
    ['sla_breached', 'TCOM9', 'advisory', 'email'],
    ['sla_escalado', 'TCOM9', 'advisory', 'in_app'],
  ];
  for (const [eventType, templateCode, recipientRole, channel] of commRules) {
    await prisma.communicationRule.create({
      data: { eventType, templateCode, recipientRole, channel },
    });
  }

  const slaData = [
    { stateCode: 'CREADO', hours: 24 },
    { stateCode: 'EN_REVISION', hours: 48 },
    { stateCode: 'CLASIFICADO', hours: 120 },
    { stateCode: 'EN_POSTULACION', hours: 72 },
    { stateCode: 'ASIGNADO', hours: 168 },
    { stateCode: 'PROPUESTA_EN_DISENO', hours: 168 },
    { stateCode: 'PROPUESTA_LISTA_QA', hours: 24 },
    { stateCode: 'PROPUESTA_ENVIADA', hours: 24 },
    { stateCode: 'EN_DECISION_CLIENTE', hours: 168, escalateRole: 'advisory' },
    { stateCode: 'AJUSTES_DE_PROPUESTA', hours: 120 },
    { stateCode: 'PROPUESTA_ACEPTADA', hours: 24 },
    { stateCode: 'PENDIENTE_CONTRATACION', hours: 120 },
    { stateCode: 'AUTORIZADO_EJECUCION', hours: 48 },
    { stateCode: 'EN_EJECUCION', hours: 240 },
    { stateCode: 'LISTO_PARA_CIERRE', hours: 48 },
  ];
  const slaRuleByState: Record<string, { id: string; hours: number }> = {};
  for (const s of slaData) {
    const r = await prisma.slaRule.create({ data: s });
    slaRuleByState[s.stateCode] = { id: r.id, hours: s.hours };
  }

  const companyNames = ['FoodTech SAS', 'RetailModa', 'Salud Total', 'Ingeniería Nova', 'Comercial Andes', 'Agrícola del Sur', 'Transportes Rápidos'];
  const companies: Record<string, string> = {};
  for (const name of companyNames) {
    const c = await prisma.company.create({
      data: { tenantId: tenant.id, name, emailDomain: slug(name).replace(/-/g, '') + '.com' },
    });
    companies[name] = c.id;
  }

  // El usuario mipyme pertenece a una empresa: acota sus notificaciones (RBAC).
  await prisma.user.update({
    where: { id: users['mipyme'] },
    data: { companyId: companies['RetailModa'] },
  });

  // Fichas del ciclo de vida del consultor (F4). Carlos esta HABILITADO
  // (finanzas+tecnologia, senior); Diana esta REGISTRADA y ve la bolsa vacia
  // hasta que el flujo la habilite (criterio de aceptacion F4).
  const consultantData = [
    { key: 'consultor', humanId: 'CON-000001', specialties: [], level: 'senior', availability: 'disponible', status: 'habilitado', enabledAt: new Date() },
    { key: 'consultor2', humanId: 'CON-000002', specialties: [], level: null, availability: 'disponible', status: 'registrado', enabledAt: null },
  ];
  const consultants: Record<string, string> = {};
  for (const kc of consultantData) {
    const row = await prisma.consultant.create({
      data: {
        tenantId: tenant.id,
        userId: users[kc.key],
        humanId: kc.humanId,
        specialtyCodes: kc.specialties,
        levelCode: kc.level,
        availability: kc.availability,
        status: kc.status,
        enabledAt: kc.enabledAt,
      },
    });
    consultants[kc.key] = row.id;
  }

  const caseData = [
    { humanId: 'NOD-2026-001', company: 'FoodTech SAS', state: 'CERRADO', assignee: 'consultor', area: 'finanzas', nivel: 'alta' },
    { humanId: 'NOD-2026-002', company: 'RetailModa', state: 'EN_EJECUCION', assignee: 'consultor', area: 'operaciones', nivel: 'media' },
    { humanId: 'NOD-2026-003', company: 'Salud Total', state: 'EN_POSTULACION', assignee: null, area: 'finanzas', nivel: 'media' },
    { humanId: 'NOD-2026-004', company: 'Ingeniería Nova', state: 'CLASIFICADO', assignee: null, area: 'tecnologia', nivel: 'alta' },
    { humanId: 'NOD-2026-005', company: 'Comercial Andes', state: 'CLASIFICADO', assignee: null, area: 'marketing', nivel: 'baja' },
    { humanId: 'NOD-2026-008', company: 'Agrícola del Sur', state: 'CREADO', assignee: null, area: 'operaciones', nivel: 'media' },
    { humanId: 'NOD-2026-009', company: 'Transportes Rápidos', state: 'CREADO', assignee: null, area: 'operaciones', nivel: 'media' },
  ];

  let seq = 0;
  let prevHash: string | null = null;
  let timerIdx = 0;
  const createdCases: Record<string, string> = {};
  for (const c of caseData) {
    const created = await prisma.case.create({
      data: {
        tenantId: tenant.id,
        humanId: c.humanId,
        title: 'Diagnostico y acompanamiento - ' + c.company,
        companyId: companies[c.company],
        currentStateId: states[c.state],
        assignedUserId: c.assignee ? users[c.assignee] : null,
        areaCode: c.area,
        complexityLevel: c.nivel,
      },
    });
    createdCases[c.humanId] = created.id;
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
    const rowHash = computeRowHash(prevHash, rec);
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

    // SLA timer para casos activos (variando el consumo: ok / riesgo / critico)
    const rule = slaRuleByState[c.state];
    if (rule && c.state !== 'CERRADO') {
      const consumedPct = [30, 60, 92, 115][timerIdx % 4];
      timerIdx += 1;
      const hoursMs = rule.hours * 3600 * 1000;
      const startedAt = new Date(Date.now() - (hoursMs * consumedPct) / 100);
      const dueAt = new Date(startedAt.getTime() + hoursMs);
      await prisma.slaTimer.create({
        data: { caseId: created.id, ruleId: rule.id, startedAt, dueAt, status: 'RUNNING' },
      });
    }
  }

  // Repositorio documental (F3): entregable versionado en el caso en ejecucion.
  // La bitacora documenta cada subida (DOCUMENTO_SUBIDO) con el mismo mecanismo
  // append-only: seq continua y rowHash encadena con el ultimo eslabon.
  const demoCaseId = createdCases['NOD-2026-002'];
  const demoCase = await prisma.case.findUniqueOrThrow({
    where: { id: demoCaseId },
    include: { company: true },
  });
  // El repositorio documental vive en Cloudflare R2 (MinIO como sustituto
  // local). Si no esta disponible se OMITE el entregable demo: nunca se crean
  // filas de documento sin su archivo detras.
  const storage = createObjectStorage(storageConfigFromEnv());
  let storageOk = true;
  try {
    await storage.ensureBucket();
  } catch {
    storageOk = false;
    console.warn(
      'Seed: almacenamiento de objetos no disponible; se omite el entregable demo. ' +
        'Para incluirlo: `docker compose up -d minio` en local, o configura R2_*.',
    );
  }

  if (storageOk) {
    const demoDoc = await prisma.document.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCaseId,
        stateCode: 'EN_EJECUCION',
        kind: 'entregable',
        title: 'Entregable Estudio de Mercado',
        currentVersion: 2,
      },
    });
    // La ruta la construye objectKeyFor, no el seed: duplicar el esquema aqui
    // fue lo que dejo claves distintas a las que genera la aplicacion.
    const keyFor = (version: number) =>
      objectKeyFor({
        companyId: demoCase.companyId,
        caseId: demoCaseId,
        stateCode: 'EN_EJECUCION',
        documentId: demoDoc.id,
        version,
        filename: 'entregable-estudio-mercado.pdf',
      });
    const v1key = keyFor(1);
    const v2key = keyFor(2);
    // Contenido REAL de cada version: se sube al bucket y de ahi salen tamano y
    // checksum. Antes se inventaban ambos y no se subia nada, asi que la demo
    // mostraba un entregable cuyas dos versiones daban 404 al descargarlas.
    const demoVersions = [
      { version: 1, objectKey: v1key, body: Buffer.from('NODUS demo - Estudio de Mercado - v1') },
      { version: 2, objectKey: v2key, body: Buffer.from('NODUS demo - Estudio de Mercado - v2 (revisada)') },
    ].map((v) => ({
      ...v,
      sizeBytes: v.body.length,
      checksum: createHash('sha256').update(v.body).digest('hex'),
    }));
    for (const dv of demoVersions) {
      await storage.putObject(dv.objectKey, dv.body, 'text/plain');
    }
    for (const dv of demoVersions) {
      const row = await prisma.documentVersion.create({
        data: {
          documentId: demoDoc.id,
          version: dv.version,
          objectKey: dv.objectKey,
          mime: 'application/pdf',
          sizeBytes: dv.sizeBytes,
          checksum: dv.checksum,
          uploadedById: users['consultor'],
          confirmedAt: new Date(),
        },
      });
      seq += 1;
      const rec = {
        seq,
        action: 'DOCUMENTO_SUBIDO',
        entityType: 'DocumentVersion',
        entityId: row.id,
        fromState: null as string | null,
        toState: null as string | null,
        payload: { kind: 'entregable', title: 'Entregable Estudio de Mercado', version: dv.version, sizeBytes: dv.sizeBytes } as unknown,
      };
      const rowHash = computeRowHash(prevHash, rec);
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          seq,
          caseId: demoCaseId,
          actorId: users['consultor'],
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
  }

  // Notificaciones de distinto alcance, para que el scoping por rol sea visible:
  // - N1: caso de RetailModa (asignado al consultor) -> lo ven consultor y mipyme.
  // - N2: caso sin asignar -> solo PMO/Admin.
  // - N3: sin caso (interno de SLA) -> solo PMO/Admin.
  await prisma.notification.createMany({
    data: [
      {
        tenantId: tenant.id,
        caseId: createdCases['NOD-2026-002'],
        type: 'CASE_TRANSITIONED',
        message: 'Caso NOD-2026-002 paso a EN_EJECUCION',
        templateCode: 'TCOM10',
        channel: 'in_app',
        deliveryStatus: 'sent',
        sentAt: new Date(),
      },
      {
        tenantId: tenant.id,
        caseId: createdCases['NOD-2026-005'],
        type: 'CASE_TRANSITIONED',
        message: 'Caso NOD-2026-005 paso a CLASIFICADO',
        templateCode: 'TCOM5',
        channel: 'in_app',
        deliveryStatus: 'sent',
        sentAt: new Date(),
      },
      {
        tenantId: tenant.id,
        type: 'SLA_WARN',
        message: 'Revision interna de SLA pendiente',
        templateCode: 'TCOM8',
        channel: 'in_app',
        deliveryStatus: 'sent',
        sentAt: new Date(),
      },
    ],
  });

  console.log('Seed OK:');
  console.log('  tenant:', tenant.slug, '(' + tenant.name + ')');
  console.log('  roles:', Object.keys(roles).length, '| usuarios:', Object.keys(users).length);
  console.log('  estados:', stateData.length, '| transiciones:', transitions.length, '| SLA rules:', slaData.length);
  console.log('  plantillas comunicacion:', commTemplates.length, '| reglas de comunicacion:', commRules.length, '| plantillas F4:', consultingTemplates.length);
  console.log('  empresas:', companyNames.length, '| casos:', caseData.length);
  console.log('  consultores:', consultantData.length, '(habilitado: Carlos CON-000001, registrado: Diana CON-000002)');
  // Se cuenta, no se afirma: el entregable demo se omite cuando no hay
  // almacenamiento, y un resumen que no mide lo que dice no sirve de nada.
  const docCount = await prisma.document.count();
  const verCount = await prisma.documentVersion.count();
  console.log(
    '  documentos demo:',
    docCount,
    '| versiones:',
    verCount,
    docCount === 0 ? '(omitido: sin almacenamiento de objetos)' : '',
  );
  console.log('  bitacora hash-chain:', seq, 'registros | ultimo hash:', (prevHash ?? '').slice(0, 16) + '...');
  console.log('  login demo -> advisory@demo.nodus / demo1234 (y consultor@, consultor2@, mipyme@, admin@)');
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
