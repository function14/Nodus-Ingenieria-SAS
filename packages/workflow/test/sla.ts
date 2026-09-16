import { prisma } from '@nodus/db';
import { sweepSla } from '../src/index';

async function counts() {
  const g = await prisma.slaTimer.groupBy({ by: ['status'], _count: { _all: true } });
  return g.map((x) => x.status + ':' + x._count._all).join(' ');
}

async function main() {
  console.log('timers antes ->', await counts());
  const r = await sweepSla();
  console.log('sweep ->', JSON.stringify(r));
  console.log('timers despues ->', await counts());
  const notifs = await prisma.notification.count({ where: { type: { in: ['SLA_WARN', 'SLA_BREACHED'] } } });
  console.log('notificaciones SLA ->', notifs);
  const idempotent = await sweepSla();
  console.log('sweep 2 (idempotente) ->', JSON.stringify(idempotent));
  const ok = r.breached >= 1 && r.warned >= 1 && idempotent.breached === 0 && idempotent.warned === 0;
  console.log(ok ? 'SLA SWEEP OK' : 'SLA SWEEP FALLIDO');
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}
main();
