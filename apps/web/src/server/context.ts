import { auth } from '@/auth';
import { prisma } from '@nodus/db';

export async function createContext() {
  const session = await auth();
  return { prisma, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
