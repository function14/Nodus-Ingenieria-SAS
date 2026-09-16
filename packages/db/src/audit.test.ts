import { describe, it, expect } from 'vitest';
import { computeRowHash, type AuditRecord } from './audit';

const rec = (seq: number, payload: unknown): AuditRecord => ({
  seq,
  action: 'CASO_TRANSICION',
  entityType: 'Case',
  entityId: 'c1',
  fromState: 'CREADO',
  toState: 'EN_REVISION',
  payload,
});

describe('computeRowHash', () => {
  it('es determinista', () => {
    const a = computeRowHash(null, rec(1, { x: 1 }));
    const b = computeRowHash(null, rec(1, { x: 1 }));
    expect(a).toBe(b);
  });

  it('es estable ante el orden de claves del payload (stableStringify)', () => {
    const a = computeRowHash(null, rec(1, { x: 1, y: 2 }));
    const b = computeRowHash(null, rec(1, { y: 2, x: 1 }));
    expect(a).toBe(b);
  });

  it('encadena: cambiar prevHash cambia el rowHash', () => {
    const a = computeRowHash('AAAA', rec(2, { x: 1 }));
    const b = computeRowHash('BBBB', rec(2, { x: 1 }));
    expect(a).not.toBe(b);
  });

  it('detecta manipulacion: cambiar el contenido cambia el hash', () => {
    const original = computeRowHash(null, rec(1, { monto: 100 }));
    const tampered = computeRowHash(null, rec(1, { monto: 999 }));
    expect(original).not.toBe(tampered);
  });
});
