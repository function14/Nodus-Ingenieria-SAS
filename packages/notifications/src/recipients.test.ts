import { describe, it, expect } from 'vitest';
import { resolveEmailRecipients } from './recipients';
import type { TxOrClient } from './types';

function fakePrisma() {
  const users = [
    { id: 'uid-m1', name: 'Maria Mipyme', email: 'mipyme@demo.nodus' },
    { id: 'uid-m2', name: 'M2', email: 'mipyme@demo.nodus' },
    { id: 'uid-c', name: 'Carlos Consultor', email: 'consultor@demo.nodus' },
    { id: 'uid-a', name: 'Ana Advisory', email: 'advisory@demo.nodus' },
  ];
  const prisma = {
    user: {
      findFirst: async (q: { where: { id?: string; tenantId?: string } }) =>
        users.find((u) => u.id === q.where.id) ?? null,
      findMany: async (q: { where: { companyId?: string; role?: { code: string } } }) => {
        if (q.where.role?.code === 'mipyme') return users.slice(0, 2);
        if (q.where.role?.code === 'advisory') return users.slice(3, 4);
        return [];
      },
    },
    case: {
      findUnique: async () => ({ id: 'case-1', companyId: 'cmp-1', assignedUserId: 'uid-c' }),
    },
  } as unknown as TxOrClient;
  return prisma;
}

describe('resolveEmailRecipients', () => {
  it('override: respeta el/los correos forzados', async () => {
    const single = await resolveEmailRecipients({ prisma: fakePrisma(), tenantId: 't', overrideEmails: 'a@b.co' });
    expect(single).toEqual([{ userId: null, email: 'a@b.co', name: '' }]);

    const multi = await resolveEmailRecipients({
      prisma: fakePrisma(),
      tenantId: 't',
      overrideEmails: ['a@b.co', 'a@b.co', ' c@d.co '],
    });
    expect(multi).toEqual([
      { userId: null, email: 'a@b.co', name: '' },
      { userId: null, email: 'c@d.co', name: '' },
    ]);
  });

  it('mipyme: usa los usuarios de la empresa del caso (rol mipyme)', async () => {
    const out = await resolveEmailRecipients({
      prisma: fakePrisma(),
      tenantId: 't',
      caseId: 'case-1',
      recipientRole: 'mipyme',
    });
    expect(out).toEqual([{ userId: 'uid-m1', email: 'mipyme@demo.nodus', name: 'Maria Mipyme' }]);
  });

  it('consultor: usa el consultor asignado al caso', async () => {
    const [out] = await resolveEmailRecipients({
      prisma: fakePrisma(),
      tenantId: 't',
      caseId: 'case-1',
      recipientRole: 'consultor',
    });
    expect(out).toEqual({ userId: 'uid-c', email: 'consultor@demo.nodus', name: 'Carlos Consultor' });
  });

  it('advisory: difusion al equipo PMO', async () => {
    const out = await resolveEmailRecipients({
      prisma: fakePrisma(),
      tenantId: 't',
      recipientRole: 'advisory',
    });
    expect(out).toEqual([{ userId: 'uid-a', email: 'advisory@demo.nodus', name: 'Ana Advisory' }]);
  });

  it('destinatario concreto (userId) primero y deduplicado', async () => {
    const out = await resolveEmailRecipients({
      prisma: fakePrisma(),
      tenantId: 't',
      userId: 'uid-m1',
      caseId: 'case-1',
      recipientRole: 'mipyme',
    });
    expect(out.map((r) => r.email)).toEqual(['mipyme@demo.nodus']);
  });
});