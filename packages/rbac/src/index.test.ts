import { describe, it, expect } from 'vitest';
import {
  allowedRoutes,
  applyCaseMask,
  canAccess,
  canPerform,
  isCaseMaskedFor,
  MASKED_COMPANY,
  MASKED_TITLE,
  notificationScope,
  type Actor,
} from './index';

const advisory: Actor = { id: 'u-adv', role: 'advisory', tenantId: 't1' };
const admin: Actor = { id: 'u-adm', role: 'admin', tenantId: 't1' };
const consultor: Actor = { id: 'u-con', role: 'consultor', tenantId: 't1' };
const mipyme: Actor = { id: 'u-mip', role: 'mipyme', tenantId: 't1', companyId: 'c1' };

describe('canAccess (recursos de lectura)', () => {
  it('reserva los directorios y el ledger a PMO/Admin', () => {
    for (const resource of ['companyDirectory', 'consultantDirectory', 'auditLedger', 'workflowDefinition', 'dashboard'] as const) {
      expect(canAccess(advisory, resource)).toBe(true);
      expect(canAccess(admin, resource)).toBe(true);
      expect(canAccess(consultor, resource)).toBe(false);
      expect(canAccess(mipyme, resource)).toBe(false);
    }
  });

  it('deja casos y notificaciones a todos los roles operativos', () => {
    for (const actor of [advisory, admin, consultor, mipyme]) {
      expect(canAccess(actor, 'cases')).toBe(true);
      expect(canAccess(actor, 'notifications')).toBe(true);
    }
  });

  it('la bolsa excluye a mipyme', () => {
    expect(canAccess(consultor, 'bolsa')).toBe(true);
    expect(canAccess(advisory, 'bolsa')).toBe(true);
    expect(canAccess(mipyme, 'bolsa')).toBe(false);
  });
});

describe('canPerform (acciones)', () => {
  it('asignar es solo de advisory', () => {
    expect(canPerform(advisory, 'case.assign')).toBe(true);
    expect(canPerform(admin, 'case.assign')).toBe(false);
    expect(canPerform(consultor, 'case.assign')).toBe(false);
  });

  it('postularse es solo de consultor', () => {
    expect(canPerform(consultor, 'postulation.create')).toBe(true);
    expect(canPerform(advisory, 'postulation.create')).toBe(false);
  });

  it('el barrido SLA es de PMO/Admin', () => {
    expect(canPerform(advisory, 'sla.sweep')).toBe(true);
    expect(canPerform(admin, 'sla.sweep')).toBe(true);
    expect(canPerform(mipyme, 'sla.sweep')).toBe(false);
  });

  it('crear caso: no lo hace el consultor', () => {
    expect(canPerform(mipyme, 'case.create')).toBe(true);
    expect(canPerform(advisory, 'case.create')).toBe(true);
    expect(canPerform(consultor, 'case.create')).toBe(false);
  });
});

describe('allowedRoutes (el nav deriva de los permisos)', () => {
  it('consultor y mipyme no tienen rutas de PMO', () => {
    for (const actor of [consultor, mipyme]) {
      const routes = allowedRoutes(actor.role);
      expect(routes).not.toContain('/empresas');
      expect(routes).not.toContain('/consultores');
      expect(routes).not.toContain('/bitacora');
      expect(routes).not.toContain('/workflow');
      expect(routes).not.toContain('/');
      expect(routes).toContain('/casos');
      expect(routes).toContain('/alertas');
      expect(routes).toContain('/perfil');
    }
  });

  it('advisory ve todo y mipyme no ve la bolsa', () => {
    expect(allowedRoutes('advisory')).toContain('/empresas');
    expect(allowedRoutes('consultor')).toContain('/bolsa');
    expect(allowedRoutes('mipyme')).not.toContain('/bolsa');
  });
});

describe('masking de caso (regla unica: lista y detalle)', () => {
  const unassigned = { assignedUserId: null };
  const assignedToConsultor = { assignedUserId: 'u-con' };

  it('enmascara al consultor en casos no asignados a el', () => {
    expect(isCaseMaskedFor(consultor, unassigned)).toBe(true);
    expect(isCaseMaskedFor(consultor, { assignedUserId: 'otro' })).toBe(true);
  });

  it('no enmascara al consultor en su caso asignado', () => {
    expect(isCaseMaskedFor(consultor, assignedToConsultor)).toBe(false);
  });

  it('nunca enmascara a advisory/admin/mipyme', () => {
    for (const actor of [advisory, admin, mipyme]) {
      expect(isCaseMaskedFor(actor, unassigned)).toBe(false);
    }
  });

  it('applyCaseMask sustituye empresa y titulo', () => {
    const masked = applyCaseMask(consultor, unassigned, { title: 'Real', company: 'ACME' });
    expect(masked.masked).toBe(true);
    expect(masked.company).toBe(MASKED_COMPANY);
    expect(masked.title).toBe(MASKED_TITLE);

    const visible = applyCaseMask(consultor, assignedToConsultor, { title: 'Real', company: 'ACME' });
    expect(visible.masked).toBe(false);
    expect(visible.company).toBe('ACME');
  });
});

describe('notificationScope', () => {
  it('PMO/Admin ven todo el tenant', () => {
    expect(notificationScope(advisory)).toEqual({ kind: 'all' });
    expect(notificationScope(admin)).toEqual({ kind: 'all' });
  });

  it('consultor: casos asignados + difusion a su rol', () => {
    expect(notificationScope(consultor)).toEqual({ kind: 'assignedCases', role: 'consultor' });
  });

  it('mipyme: su empresa + difusion a su rol', () => {
    expect(notificationScope(mipyme)).toEqual({ kind: 'ownCompany', companyId: 'c1', role: 'mipyme' });
  });

  it('mipyme sin empresa cae a "solo lo propio"', () => {
    expect(notificationScope({ ...mipyme, companyId: null })).toEqual({ kind: 'ownOnly' });
  });
});
