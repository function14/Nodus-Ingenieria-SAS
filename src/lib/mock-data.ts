export type CaseStatus =
  | 'CREADO'
  | 'CLASIFICADO'
  | 'PROPUESTA'
  | 'EN_EJECUCION'
  | 'CERRADO';

export const kpis = [
  { label: 'Casos activos', value: 12, delta: '+2 vs mes anterior' },
  { label: 'SLA críticos', value: 4, delta: 'Requieren acción' },
  { label: 'Conversión', value: '68%', delta: '+5 pp vs Q2' },
  { label: 'Cerrados mes', value: 24, delta: 'Meta: 30' },
];

export const slaByStage = [
  { stage: 'Creado', ok: 9, warn: 2, critical: 1 },
  { stage: 'Clasificado', ok: 4, warn: 1, critical: 0 },
  { stage: 'Propuesta', ok: 6, warn: 1, critical: 1 },
  { stage: 'Ejecución', ok: 2, warn: 0, critical: 1 },
  { stage: 'Cierre', ok: 2, warn: 0, critical: 0 },
];

export const funnel = [
  { stage: 'Creado', value: 12 },
  { stage: 'Clasificado', value: 10 },
  { stage: 'Propuesta', value: 9 },
  { stage: 'Decisión', value: 7 },
  { stage: 'Contratado', value: 6 },
  { stage: 'Cerrado', value: 5 },
];

export const kanbanColumns: {
  status: CaseStatus;
  colorClass: string;
  cards: {
    id: string;
    company: string;
    roleColorClass: string;
    consultantInitials?: string;
  }[];
}[] = [
  {
    status: 'CREADO',
    colorClass: 'bg-mipyme/20',
    cards: [
      { id: 'NOD-2026-008', company: 'Agrícola del Sur', roleColorClass: 'bg-mipyme' },
      { id: 'NOD-2026-009', company: 'Transportes Rápidos', roleColorClass: 'bg-mipyme' },
    ],
  },
  {
    status: 'CLASIFICADO',
    colorClass: 'bg-advisory/20',
    cards: [
      {
        id: 'NOD-2026-004',
        company: 'Ingeniería Nova',
        roleColorClass: 'bg-advisory',
        consultantInitials: 'LP',
      },
      {
        id: 'NOD-2026-005',
        company: 'Comercial Andes',
        roleColorClass: 'bg-consultor',
        consultantInitials: 'MR',
      },
    ],
  },
  {
    status: 'PROPUESTA',
    colorClass: 'bg-teal/20',
    cards: [
      {
        id: 'NOD-2026-003',
        company: 'Salud Total',
        roleColorClass: 'bg-consultor',
        consultantInitials: 'AR',
      },
    ],
  },
  {
    status: 'EN_EJECUCION',
    colorClass: 'bg-advisory/20',
    cards: [
      {
        id: 'NOD-2026-002',
        company: 'RetailModa',
        roleColorClass: 'bg-consultor',
        consultantInitials: 'JG',
      },
    ],
  },
  {
    status: 'CERRADO',
    colorClass: 'bg-success/20',
    cards: [
      { id: 'NOD-2026-001', company: 'FoodTech SAS', roleColorClass: 'bg-success' },
    ],
  },
];

export const radialTimers = [
  { label: 'NOD-2026-002', pct: 72, color: '#16A34A' },
  { label: 'NOD-2026-004', pct: 90, color: '#FACC15' },
  { label: 'NOD-2026-008', pct: 105, color: '#DC2626' },
];
