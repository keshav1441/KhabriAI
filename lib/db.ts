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
  // Recreate after schema changes — stale dev singleton lacks new models.
  // Check the most recently added model, or a client generated before it will
  // be reused and every call on the new model reads as undefined.
  if (cached && "alert" in cached) return cached;
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();

// Runs generated SQL under a per-statement timeout so a runaway join
// (cross join, missing predicate) cannot hold a Neon connection open.
// SET LOCAL scopes the timeout to this transaction only.
export function runGuardedQuery(
  sql: string,
  { timeoutMs = 8000, districtId = null }: { timeoutMs?: number; districtId?: number | null } = {}
): Promise<Record<string, unknown>[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    if (districtId) await scopeTx(tx, districtId);
    return tx.$queryRawUnsafe(sql) as Promise<Record<string, unknown>[]>;
  });
}

// ---- Row-level scope -------------------------------------------------------
// A district-bound officer's queries run inside a transaction that sets
// app.district_id; the RLS policies (migration 20260822170000_role_scope_rls)
// then hide every case, accused, victim, arrest and chargesheet outside that
// district - whatever SQL the model wrote. No setting = no restriction.
export type Db = Pick<PrismaClient, "$queryRaw" | "$queryRawUnsafe" | "$executeRawUnsafe">;

// The owner role bypasses RLS, so a scoped transaction first drops to the
// non-owner role (migration 20260822171000_scope_role), then sets the district.
async function scopeTx(tx: { $executeRawUnsafe: (s: string) => Promise<number> }, districtId: number) {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE khabri_scoped`);
  await tx.$executeRawUnsafe(`SET LOCAL app.district_id = '${Math.floor(districtId)}'`);
}

export async function withScope<T>(
  districtId: number | null | undefined,
  fn: (db: Db) => Promise<T>,
  { timeoutMs = 15000 }: { timeoutMs?: number } = {}
): Promise<T> {
  if (!districtId) return fn(prisma);
  return prisma.$transaction(
    async (tx) => {
      await scopeTx(tx, districtId);
      return fn(tx as unknown as Db);
    },
    { timeout: timeoutMs }
  );
}

// A client whose every query runs in its own scoped transaction - lets a route
// swap `prisma.` for `db.` and be done. Unscoped users get the plain client.
export function scopedClient(districtId: number | null | undefined): Db {
  if (!districtId) return prisma;
  return {
    $queryRaw: ((...args: unknown[]) => withScope(districtId, (db) => (db.$queryRaw as unknown as (...a: unknown[]) => Promise<unknown>)(...args))) as PrismaClient["$queryRaw"],
    $queryRawUnsafe: ((...args: unknown[]) => withScope(districtId, (db) => (db.$queryRawUnsafe as unknown as (...a: unknown[]) => Promise<unknown>)(...args))) as PrismaClient["$queryRawUnsafe"],
    $executeRawUnsafe: ((...args: unknown[]) => withScope(districtId, (db) => (db.$executeRawUnsafe as unknown as (...a: unknown[]) => Promise<number>)(...args))) as PrismaClient["$executeRawUnsafe"],
  };
}
