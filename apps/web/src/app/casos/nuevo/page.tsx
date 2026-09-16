'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { JsonSchemaForm } from '@/components/ui/json-schema-form';

export default function NuevoCasoPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const companiesQ = trpc.companies.list.useQuery();
  const templateQ = trpc.templates.getActive.useQuery({ code: 'T1' });

  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = trpc.cases.create.useMutation({
    onSuccess: async (res) => {
      await Promise.all([utils.cases.list.invalidate(), utils.notifications.recent.invalidate()]);
      router.push(`/casos/${res.id}`);
    },
    onError: (e) => setError(e.message),
  });

  function submit(data: Record<string, string>) {
    if (!companyId) {
      setError('Selecciona una empresa');
      return;
    }
    setError(null);
    create.mutate({ companyId, data });
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <Link href="/casos" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink w-fit">
        <ArrowLeft size={16} /> Casos
      </Link>
      <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Nuevo caso</h1>

      <Card>
        <CardHeader>
          <CardTitle>{templateQ.data?.name ?? 'Apertura del caso (T1)'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Empresa <span className="text-danger">*</span>
            </span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink w-full"
            >
              <option value="">Selecciona una empresa…</option>
              {companiesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {templateQ.isLoading && <p className="text-sm text-ink-muted">Cargando plantilla…</p>}
          {templateQ.data && (
            <JsonSchemaForm
              jsonSchema={templateQ.data.jsonSchema}
              uiSchema={templateQ.data.uiSchema}
              submitting={create.isPending}
              onSubmit={submit}
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
