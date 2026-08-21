import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { runGuardedQuery } from "../lib/db";

after(() => prisma.$disconnect());

test("a query slower than the timeout is cancelled", async () => {
  await assert.rejects(
    runGuardedQuery("SELECT pg_sleep(3)", { timeoutMs: 500 }),
    /statement timeout/i
  );
});

test("a fast query returns rows", async () => {
  const rows = await runGuardedQuery("SELECT 1 AS one", { timeoutMs: 5000 });
  assert.deepEqual(rows, [{ one: 1 }]);
});
