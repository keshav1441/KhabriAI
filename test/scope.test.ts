import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, withScope, runGuardedQuery } from "../lib/db";

after(() => prisma.$disconnect());

const MYSURU = 3;
const count = (db: { $queryRawUnsafe: (s: string) => Promise<unknown> }, sql: string) =>
  (db.$queryRawUnsafe(sql) as Promise<{ n: number }[]>).then((r) => Number(r[0].n));

test("a district-scoped transaction only sees that district's cases and their children", async () => {
  const all = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster"`);
  const expected = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster" cm JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" WHERE u."DistrictID" = ${MYSURU}`);
  const scoped = await withScope(MYSURU, (db) => count(db, `SELECT COUNT(*)::int n FROM "CaseMaster"`));
  assert.equal(scoped, expected);
  assert.ok(scoped < all);
  const accusedAll = await count(prisma, `SELECT COUNT(*)::int n FROM "Accused"`);
  const accusedScoped = await withScope(MYSURU, (db) => count(db, `SELECT COUNT(*)::int n FROM "Accused"`));
  assert.ok(accusedScoped > 0 && accusedScoped < accusedAll, "child table follows the case scope");
});

test("no scope means no restriction", async () => {
  const all = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster"`);
  assert.equal(await withScope(null, (db) => count(db, `SELECT COUNT(*)::int n FROM "CaseMaster"`)), all);
});

test("runGuardedQuery applies the scope to model-written SQL against any table", async () => {
  const rows = await runGuardedQuery(`SELECT COUNT(DISTINCT "PersonID")::int AS n FROM "Accused"`, { districtId: MYSURU });
  const all = await count(prisma, `SELECT COUNT(DISTINCT "PersonID")::int n FROM "Accused"`);
  assert.ok(Number(rows[0].n) < all);
});
