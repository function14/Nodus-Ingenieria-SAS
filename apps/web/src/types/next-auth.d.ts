import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
      companyId: string | null;
    } & DefaultSession['user'];
  }
  interface User {
    role?: string;
    tenantId?: string;
    companyId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    role?: string;
    tenantId?: string;
    companyId?: string | null;
  }
}
