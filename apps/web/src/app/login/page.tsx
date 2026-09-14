'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('advisory@demo.nodus');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (!res || res.error) {
      setError('Credenciales inválidas. Revisa el correo y la contraseña.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  const inputClass =
    'rounded-lg border border-border px-3 py-2 bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-cream">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white font-[family-name:var(--font-display)] font-bold">
            N
          </div>
          <span className="font-[family-name:var(--font-display)] font-bold text-xl">NODUS</span>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-surface border border-border rounded-2xl shadow-offset p-6 flex flex-col gap-4"
        >
          <div>
            <h1 className="font-[family-name:var(--font-display)] font-bold text-lg">Iniciar sesión</h1>
            <p className="text-sm text-ink-muted">Orquestación de casos — 911MiPyme</p>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary-deep text-white font-medium py-2 shadow-offset-sm transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Entrar'}
          </button>

          <p className="text-xs text-ink-muted text-center">
            Demo: advisory@demo.nodus · demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
