/**
 * Adaptador de canal email (Resend).
 *
 * Activo SOLO si existe RESEND_API_KEY. Sin la clave, el canal degrada a
 * in-app sin romper nada: notify() nunca llega aqui.
 */

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** Destinatario de correo resuelto: lleva el userId para trazar el receptor. */
export interface EmailRecipient {
  userId: string | null;
  email: string;
  name: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, skipped: true };

  try {
    // Carga diferida: el SDK solo se descarga/ejecuta si hay canal email.
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
    });
    if (error) {
      return {
        ok: false,
        error: typeof error === 'string' ? error : (error.message ?? 'resend error'),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}