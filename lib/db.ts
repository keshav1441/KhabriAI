import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  // Pass config, not a pg.Pool instance: the standalone bundle ships two copies
  // of pg, so the adapter's `instanceof pg.Pool` check fails and it mangles the
  // pool into a connection config. Let the adapter own the pool instead.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter, log: ["error"] });
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // Recreate after schema changes — stale dev singleton lacks new models
  if (cached && "chatSession" in cached) return cached;
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();
