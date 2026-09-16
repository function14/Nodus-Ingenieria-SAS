import { validateSubmission, deriveFields } from '../src/index';

const schema = {
  type: 'object',
  required: ['titulo', 'area', 'descripcion'],
  properties: {
    titulo: { type: 'string', title: 'Titulo del caso', minLength: 3 },
    area: { type: 'string', title: 'Area', enum: ['finanzas', 'legal'] },
    urgencia: { type: 'string', enum: ['baja', 'media', 'alta'], default: 'media' },
    descripcion: { type: 'string', title: 'Descripcion', minLength: 10 },
  },
};

const good = validateSubmission(schema, {
  titulo: 'Diagnostico financiero',
  area: 'finanzas',
  descripcion: 'Necesitamos ayuda con el flujo de caja de forma urgente',
});
const badMissing = validateSubmission(schema, { titulo: 'X' });
const badEnum = validateSubmission(schema, {
  titulo: 'Diagnostico',
  area: 'marketing',
  descripcion: 'texto suficientemente largo para pasar',
});
const badShort = validateSubmission(schema, { titulo: 'ab', area: 'legal', descripcion: 'corto' });

const fields = deriveFields(schema, { descripcion: { widget: 'textarea' } });

console.log('valido:', good.valid, '| errores:', good.errors.length);
console.log('rechaza faltante:', !badMissing.valid, badMissing.errors);
console.log('rechaza enum:', !badEnum.valid);
console.log('rechaza minLength:', !badShort.valid);
console.log('campos derivados:', fields.length, '| area es select:', fields.find((f) => f.name === 'area')?.type === 'select', '| descripcion textarea:', fields.find((f) => f.name === 'descripcion')?.type === 'textarea');

const ok =
  good.valid &&
  !badMissing.valid &&
  !badEnum.valid &&
  !badShort.valid &&
  fields.length === 4 &&
  fields.find((f) => f.name === 'area')?.type === 'select' &&
  fields.find((f) => f.name === 'descripcion')?.type === 'textarea';
console.log(ok ? '\nFORMS SMOKE OK' : '\nFORMS SMOKE FALLIDO');
process.exit(ok ? 0 : 1);
