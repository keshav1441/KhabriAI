import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Ensure the generated Prisma client (and its runtime) are bundled into the
  // standalone output, since file-tracing can miss code generated into /app.
  outputFileTracingIncludes: {
    "/**": [
      "./app/generated/prisma/**",
      "./node_modules/@prisma/client/**",
      "./node_modules/@prisma/adapter-pg/**",
    ],
  },
};

export default nextConfig;
