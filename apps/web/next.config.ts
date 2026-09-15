import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nodus/db', '@nodus/schemas', '@nodus/workflow'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
