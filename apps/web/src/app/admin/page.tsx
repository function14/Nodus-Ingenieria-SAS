'use client';

import { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { trpc, type RouterOutputs } from '@/lib/trpc/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { SkeletonLines } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

type Config = RouterOutputs['admin']['overview'];
/**
 * `roles` viene del enum de RBAC; `allowedRoles` y `escalateRole` vienen de
 * Postgres como texto. La conversión se hace una sola vez, aquí, en lugar de
 * sembrar `as never` por cada llamada.
 */
type Rol = Config['roles'][number];

/** Fila de transición: alterna los roles que pueden ejecutarla. */
function FilaTransicion({
  t,
  roles,
  onGuardar,
  guardando,
}: {
  t: Config['transiciones'][number];
  roles: Rol[];
  onGuardar: (code: string, allowedRoles: Rol[]) => void;
  guardando: boolean;
}) {
  const [sel, setSel] = useState<Rol[]>(t.allowedRoles as Rol[]);
  const cambiado = sel.length !== t.allowedRoles.length || sel.some((r) => !t.allowedRoles.includes(r));

  return (
    <li className="flex flex-col gap-1.5 py-2.5 border-b border-border/60">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-medium">{t.name}</span>
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
          {t.from} → {t.to}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {roles.map((r) => {
          const activo = sel.includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={activo}
              onClick={() => setSel(activo ? sel.filter((x) => x !== r) : [...sel, r])}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                activo ? 'bg-ink text-white' : 'bg-cream-dark text-ink-muted hover:bg-border'
              }`}
            >
              {r}
            </button>
          );
        })}
        {cambiado && (
          <button
            type="button"
            disabled={guardando || sel.length === 0}
            onClick={() => onGuardar(t.code, sel)}
            className="ml-1 inline-flex items-center gap-1 rounded-lg bg-primary-deep text-white text-[11px] font-medium px-2 py-1 disabled:opacity-50"
          >
            <Save size={11} /> Guardar
          </button>
        )}
        {sel.length === 0 && (
          <span className="text-[11px] text-danger">
            Sin roles la transición sería inalcanzable
          </span>
        )}
      </div>
    </li>
  );
}

/** Fila de regla de SLA. */
function FilaSla({
  r,
  roles,
  onGuardar,
  guardando,
}: {
  r: Config['sla'][number];
  roles: Rol[];
  onGuardar: (v: Config['sla'][number]) => void;
  guardando: boolean;
}) {
  const [v, setV] = useState(r);
  const cambiado = JSON.stringify(v) !== JSON.stringify(r);
  const campo = 'w-16 rounded-md border border-border-strong bg-transparent px-1.5 py-0.5 text-xs text-right';

  return (
    <li className="flex items-center gap-2 flex-wrap py-2 border-b border-border/60">
      <span className="font-[family-name:var(--font-mono)] text-[11px] min-w-[13rem]">
        {r.stateCode}
      </span>
      <label className="text-[11px] text-ink-muted flex items-center gap-1">
        horas
        <input
          type="number"
          min={1}
          value={v.hours}
          onChange={(e) => setV({ ...v, hours: Number(e.target.value) })}
          className={campo}
        />
      </label>
      <label className="text-[11px] text-ink-muted flex items-center gap-1">
        aviso %
        <input
          type="number"
          min={1}
          value={v.warnPct}
          onChange={(e) => setV({ ...v, warnPct: Number(e.target.value) })}
          className={campo}
        />
      </label>
      <label className="text-[11px] text-ink-muted flex items-center gap-1">
        escala %
        <input
          type="number"
          min={1}
          value={v.escalatePct}
          onChange={(e) => setV({ ...v, escalatePct: Number(e.target.value) })}
          className={campo}
        />
      </label>
      <label className="text-[11px] text-ink-muted flex items-center gap-1">
        escala a
        <select
          value={v.escalateRole ?? ''}
          onChange={(e) => setV({ ...v, escalateRole: e.target.value || null })}
          className="rounded-md border border-border-strong bg-transparent px-1.5 py-0.5 text-xs"
        >
          <option value="">—</option>
          {roles.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      {cambiado && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => onGuardar(v)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-deep text-white text-[11px] font-medium px-2 py-1 disabled:opacity-50"
        >
          <Save size={11} /> Guardar
        </button>
      )}
    </li>
  );
}

export default function AdminPage() {
  const { data, isLoading, error } = trpc.admin.overview.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();
  const [nuevoLov, setNuevoLov] = useState<Record<string, string>>({});

  /** Tras cambiar configuración hay que invalidar TODO lo que la lee. */
  async function refrescar() {
    await Promise.all([
      utils.admin.overview.invalidate(),
      utils.workflow.graph.invalidate(),
      utils.cases.availableTransitions.invalidate(),
      utils.templates.getActive.invalidate(),
    ]);
  }

  const setRoles = trpc.admin.setTransitionRoles.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: async (r) => {
      toast.exito(`Transición ${r.code}: ahora la ejecutan ${r.allowedRoles.join(', ')}.`);
      await refrescar();
    },
  });

  const setSla = trpc.admin.setSlaRule.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: async (r) => {
      toast.exito(`SLA de ${r.stateCode} actualizado.`);
      await refrescar();
    },
  });

  const addLov = trpc.admin.addLovItem.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: async (r) => {
      toast.exito(`Valor «${r.label}» añadido.`);
      setNuevoLov({});
      await refrescar();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold">Configuración</h1>
        <p className="text-sm text-ink-muted">
          Las reglas del sistema son datos y se cambian aquí, sin desplegar. Cada cambio queda en
          la bitácora encadenada: el gobierno también se audita.
        </p>
      </div>

      {isLoading && <SkeletonLines lines={8} />}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Quién puede ejecutar cada transición</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-ink-muted mb-2">
                Quitar un rol hace desaparecer el botón en la ficha del caso <em>y</em> que el motor
                rechace la acción: ambas cosas leen esta misma columna.
              </p>
              <ul className="flex flex-col">
                {data.transiciones.map((t) => (
                  <FilaTransicion
                    key={t.code}
                    t={t}
                    roles={data.roles}
                    guardando={setRoles.isPending}
                    onGuardar={(code, allowedRoles) =>
                      setRoles.mutate({ code, allowedRoles })
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tiempos de SLA por etapa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-ink-muted mb-2">
                Las <strong>horas</strong> se fijan al entrar en la etapa; los <strong>umbrales</strong>{' '}
                se leen en cada barrido. Bajar un umbral afecta a los casos ya en curso.
              </p>
              <ul className="flex flex-col">
                {data.sla.map((r) => (
                  <FilaSla
                    key={r.stateCode}
                    r={r}
                    roles={data.roles}
                    guardando={setSla.isPending}
                    onGuardar={(v) =>
                      setSla.mutate({
                        stateCode: v.stateCode,
                        hours: v.hours,
                        warnPct: v.warnPct,
                        escalatePct: v.escalatePct,
                        escalateRole: v.escalateRole as Rol | null,
                      })
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Listas de valores</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs text-ink-muted">
                Ninguna clasificación crítica admite texto libre: los formularios se alimentan de
                estas listas.
              </p>
              {data.lov.map((g) => (
                <div key={g.code} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">
                    {g.name}{' '}
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                      {g.code}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.items.map((i) => (
                      <Chip key={i.code} label={i.label} title={i.code} />
                    ))}
                    <input
                      value={nuevoLov[g.code] ?? ''}
                      onChange={(e) => setNuevoLov({ ...nuevoLov, [g.code]: e.target.value })}
                      placeholder="Nuevo valor…"
                      aria-label={`Nuevo valor para ${g.name}`}
                      className="rounded-lg border border-border-strong bg-transparent px-2 py-0.5 text-xs w-32"
                    />
                    <button
                      type="button"
                      disabled={!nuevoLov[g.code]?.trim() || addLov.isPending}
                      onClick={() =>
                        addLov.mutate({ groupCode: g.code, label: nuevoLov[g.code].trim() })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] hover:bg-cream-dark disabled:opacity-40"
                    >
                      <Plus size={11} /> Añadir
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
