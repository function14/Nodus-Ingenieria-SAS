/**
 * Renderizador de plantillas de comunicacion (TCOM).
 *
 * El cuerpo vive en `TemplateVersion.body` como dato; aqui solo se sustituyen
 * los tokens {variable}. Ningun texto de comunicacion vive en el codigo.
 * Las variables faltantes se sustituyen por cadena vacia para no filtrar
 * literales de plantilla al usuario.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function renderSubject(
  subject: string | null | undefined,
  vars: Record<string, string | number | null | undefined>,
  fallback: string,
): string {
  return subject && subject.trim().length > 0 ? renderTemplate(subject, vars) : fallback;
}