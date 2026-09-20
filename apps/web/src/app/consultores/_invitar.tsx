'use client';

import { useState } from 'react';
import { UserPlus, Copy, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

/**
 * Alta de consultor (TC1). La ejecuta Advisory porque el ecosistema es cerrado:
 * la entrada al marketplace la controla 911MiPyme, no hay auto-registro.
 *
 * El nuevo consultor nace en `registrado` y NO ve casos hasta que Advisory lo
 * clasifica y lo habilita — el ciclo completo es visible desde esta misma
 * pantalla.
 */
export function InvitarConsultor() {
  const utils = trpc.useUtils();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [copiado, setCopiado] = useState(false);

  const invitar = trpc.consultants.invite.useMutation({
    onSuccess: () => {
      utils.consultants.list.invalidate();
      setNombre('');
      setCorreo('');
      setCopiado(false);
    },
  });

  const creado = invitar.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar un consultor</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            invitar.mutate({ name: nombre.trim(), email: correo.trim() });
          }}
        >
          <label className="flex flex-col gap-1 text-xs min-w-[14rem] flex-1">
            <span className="text-ink-muted">Nombre completo</span>
            <input
              required
              minLength={3}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Laura Restrepo"
              className="rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs min-w-[16rem] flex-1">
            <span className="text-ink-muted">Correo</span>
            <input
              required
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="laura@consultora.com"
              className="rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm font-[family-name:var(--font-mono)]"
            />
          </label>
          <button
            type="submit"
            disabled={invitar.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <UserPlus size={14} />
            {invitar.isPending ? 'Registrando…' : 'Registrar'}
          </button>
        </form>

        {invitar.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {invitar.error.message}
          </p>
        )}

        {creado && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-medium">
              {creado.name} registrado como{' '}
              <span className="font-[family-name:var(--font-mono)]">{creado.humanId}</span>
            </p>
            <p className="mt-1 text-ink-muted text-xs">
              Entra en estado <span className="font-[family-name:var(--font-mono)]">registrado</span>:
              todavía no ve casos en la bolsa. Clasifícalo y habilítalo en la tabla de abajo.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-muted">Contraseña temporal:</span>
              <code className="rounded-md bg-cream-dark px-2 py-1 font-[family-name:var(--font-mono)] tracking-wider">
                {creado.passwordTemporal}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(creado.passwordTemporal).then(
                    () => setCopiado(true),
                    () => setCopiado(false),
                  );
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-cream-dark transition-colors"
              >
                {copiado ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                {copiado ? 'Copiada' : 'Copiar'}
              </button>
            </div>

            <p className="mt-2 text-xs text-ink-muted">
              Se muestra una sola vez y no queda en la bitácora. Con un proveedor de correo
              configurado, esto sería un enlace de activación en lugar de una contraseña que hay
              que transmitir a mano.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
