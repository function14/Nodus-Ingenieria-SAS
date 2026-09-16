import { describe, it, expect } from 'vitest';
import { validateSubmission } from './validate';

const schema = {
  type: 'object',
  required: ['titulo', 'area', 'descripcion'],
  properties: {
    titulo: { type: 'string', minLength: 3 },
    area: { type: 'string', enum: ['finanzas', 'legal'] },
    descripcion: { type: 'string', minLength: 10 },
  },
};

describe('validateSubmission', () => {
  it('acepta una submission valida', () => {
    const r = validateSubmission(schema, {
      titulo: 'Diagnostico',
      area: 'finanzas',
      descripcion: 'Necesitamos ayuda con el flujo de caja urgente',
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rechaza campos faltantes', () => {
    const r = validateSubmission(schema, { titulo: 'Diagnostico' });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rechaza enum invalido', () => {
    const r = validateSubmission(schema, {
      titulo: 'Diagnostico',
      area: 'marketing',
      descripcion: 'texto suficientemente largo',
    });
    expect(r.valid).toBe(false);
  });

  it('rechaza minLength', () => {
    const r = validateSubmission(schema, { titulo: 'ab', area: 'legal', descripcion: 'corto' });
    expect(r.valid).toBe(false);
  });
});
