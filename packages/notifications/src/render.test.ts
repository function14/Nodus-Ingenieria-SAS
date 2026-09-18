import { describe, it, expect } from 'vitest';
import { renderTemplate, renderSubject } from './render';

describe('renderTemplate', () => {
  it('sustituye los tokens conocidos', () => {
    const out = renderTemplate('Caso {humanId} de {empresa} paso a {estado}', {
      humanId: 'NOD-2026-001',
      empresa: 'FoodTech SAS',
      estado: 'EN_REVISION',
    });
    expect(out).toBe('Caso NOD-2026-001 de FoodTech SAS paso a EN_REVISION');
  });

  it('las variables faltantes se sustituyen por cadena vacia (sin literales de plantilla)', () => {
    const out = renderTemplate('Hola {empresa}, su caso {humanId}', {});
    expect(out).toBe('Hola , su caso ');
  });

  it('acepta numeros como variables', () => {
    const out = renderTemplate('Version {version}', { version: 2 });
    expect(out).toBe('Version 2');
  });

  it('tolera tokens sin cierre cuando no hay llave (no los rompe)', () => {
    expect(renderTemplate('texto sin tokens', { a: '1' })).toBe('texto sin tokens');
  });
});

describe('renderSubject', () => {
  it('usa el body del asunto cuando existe', () => {
    expect(renderSubject('Aviso {estado}', { estado: 'X' }, 'Fallo')).toBe('Aviso X');
  });

  it('cae al fallback cuando el asunto es vacio o nulo', () => {
    expect(renderSubject(null, {}, 'Plantilla')).toBe('Plantilla');
    expect(renderSubject('   ', {}, 'Plantilla')).toBe('Plantilla');
  });
});