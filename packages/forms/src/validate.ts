import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatError(e: ErrorObject): string {
  const missing = (e.params as { missingProperty?: string }).missingProperty;
  const field = e.instancePath.replace(/^\//, '') || missing || '';
  return (field ? field + ': ' : '') + (e.message ?? 'invalido');
}

// Valida una submission contra el JSON Schema de la plantilla (gobierno del metodo, D6).
export function validateSubmission(jsonSchema: unknown, data: unknown): ValidationResult {
  const validate = ajv.compile((jsonSchema ?? {}) as object);
  const valid = validate(data) === true;
  const errors = (validate.errors ?? []).map(formatError);
  return { valid, errors };
}
