import type { Prisma, PrismaClient } from '@nodus/db';

export type TxOrClient = PrismaClient | Prisma.TransactionClient;