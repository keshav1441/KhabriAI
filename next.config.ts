import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/**": [
      "./app/generated/prisma/**",
      "./node_modules/@prisma/client/**",
      "./node_modules/@prisma/adapter-pg/**",
      "./node_modules/onnxruntime-node/**",
      "./lib/rag-examples.json",
    ],
  },
};

export default nextConfig;
