import { describe, it, expect } from 'vitest';
import { deriveFields } from './fields';

describe('deriveFields', () => {
  it('mapea tipos correctamente', () => {
    const fields = deriveFields(
      {
        required: ['a'],
        properties: {
          a: { type: 'string', title: 'Campo A' },
          b: { type: 'string', enum: ['x', 'y'] },
          c: { type: 'string' },
        },
      },
      { c: { widget: 'textarea' } },
    );
    expect(fields).toHaveLength(3);
    expect(fields.find((f) => f.name === 'a')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'a')?.label).toBe('Campo A');
    expect(fields.find((f) => f.name === 'b')?.type).toBe('select');
    expect(fields.find((f) => f.name === 'c')?.type).toBe('textarea');
  });
});
