import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  outputFileTracingIncludes: {
    "/**": [
      "./app/generated/prisma/**",
      "./node_modules/@prisma/client/**",
      "./node_modules/@prisma/adapter-pg/**",
      "./lib/rag-examples.json",
    ],
  },
};

export default nextConfig;
