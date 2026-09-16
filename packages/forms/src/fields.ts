export interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
  default?: string;
}

interface JsonSchemaLike {
  properties?: Record<string, { type?: string; title?: string; enum?: string[]; default?: string }>;
  required?: string[];
}

// Deriva la lista de campos de un JSON Schema para renderizar el formulario.
export function deriveFields(jsonSchema: unknown, uiSchema?: unknown): FieldSpec[] {
  const schema = (jsonSchema ?? {}) as JsonSchemaLike;
  const ui = (uiSchema ?? {}) as Record<string, { widget?: string }>;
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => {
    let type: FieldSpec['type'] = 'text';
    if (prop.enum) type = 'select';
    else if (ui[name]?.widget === 'textarea') type = 'textarea';
    return {
      name,
      label: prop.title ?? name,
      type,
      required: required.has(name),
      options: prop.enum,
      default: prop.default,
    };
  });
}
