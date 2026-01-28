import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone output for Docker deployments
  output: 'standalone',

  // Note: Type checking during build is now enabled for production
  // If you need to skip certain TypeScript errors, fix them instead
  // or use the typescript configuration below with caution
  
  // Only uncomment if you have specific TypeScript errors that need to be ignored
  // In production, it's better to fix the errors than ignore them
  // typescript: {
  //   tsconfigPath: './tsconfig.json',
  // },
};

export default nextConfig;
