import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nodus/db', '@nodus/schemas', '@nodus/workflow', '@nodus/forms', '@nodus/rbac', '@nodus/notifications'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
