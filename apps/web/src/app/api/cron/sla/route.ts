import { NextResponse } from 'next/server';
import { sweepSla } from '@nodus/workflow';

// Vercel Cron llama esta ruta con Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await sweepSla();
  return NextResponse.json({ ok: true, ...result });
}
