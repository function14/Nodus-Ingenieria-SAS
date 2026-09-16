'use client';

import { useState, type FormEvent } from 'react';
import { deriveFields } from '@nodus/forms/fields';

const inputClass =
  'rounded-lg border border-border px-3 py-2 bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink w-full';

export function JsonSchemaForm({
  jsonSchema,
  uiSchema,
  submitting,
  onSubmit,
}: {
  jsonSchema: unknown;
  uiSchema?: unknown;
  submitting?: boolean;
  onSubmit: (data: Record<string, string>) => void;
}) {
  const fields = deriveFields(jsonSchema, uiSchema);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.name] = f.default ?? '';
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  function set(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const missing = fields.filter((f) => f.required && !values[f.name]?.trim()).map((f) => f.label);
    if (missing.length > 0) {
      setError('Faltan campos obligatorios: ' + missing.join(', '));
      return;
    }
    setError(null);
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
          </span>
          {f.type === 'select' ? (
            <select value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} className={inputClass}>
              <option value="">Selecciona una opción…</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              rows={3}
              className={inputClass}
            />
          ) : (
            <input
              type="text"
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              className={inputClass}
            />
          )}
        </label>
      ))}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-primary-deep text-white font-medium py-2 px-4 w-fit shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {submitting ? 'Creando…' : 'Crear caso'}
      </button>
    </form>
  );
}
