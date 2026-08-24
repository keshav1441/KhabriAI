import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, withScope, runGuardedQuery } from "../lib/db";

after(() => prisma.$disconnect());

const MYSURU = 3;
const count = (db: { $queryRawUnsafe: (s: string) => Promise<unknown> }, sql: string) =>
  (db.$queryRawUnsafe(sql) as Promise<{ n: number }[]>).then((r) => Number(r[0].n));

// The counts below are taken by separate statements, so a case registered
// while the test runs (the app is pointed at the same database) would make two
// reads of the same table disagree. Freezing the comparison to the ids that
// existed when the test started keeps it about scope, not about timing.
const snapshot = (async () => {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX("CaseMasterID"), 0)::int AS n FROM "CaseMaster"`
  )) as { n: number }[];
  return Number(rows[0].n);
})();
const upto = async () => `cm."CaseMasterID" <= ${await snapshot}`;

test("a district-scoped transaction only sees that district's cases and their children", async () => {
  const cutoff = await upto();
  const all = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster" cm WHERE ${cutoff}`);
  const expected = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster" cm JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" WHERE u."DistrictID" = ${MYSURU} AND ${cutoff}`);
  const scoped = await withScope(MYSURU, (db) => count(db, `SELECT COUNT(*)::int n FROM "CaseMaster" cm WHERE ${cutoff}`));
  assert.equal(scoped, expected);
  assert.ok(scoped < all);
  const accusedAll = await count(prisma, `SELECT COUNT(*)::int n FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID" WHERE ${cutoff}`);
  const accusedScoped = await withScope(MYSURU, (db) => count(db, `SELECT COUNT(*)::int n FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID" WHERE ${cutoff}`));
  assert.ok(accusedScoped > 0 && accusedScoped < accusedAll, "child table follows the case scope");
});

test("no scope means no restriction", async () => {
  const cutoff = await upto();
  const all = await count(prisma, `SELECT COUNT(*)::int n FROM "CaseMaster" cm WHERE ${cutoff}`);
  assert.equal(await withScope(null, (db) => count(db, `SELECT COUNT(*)::int n FROM "CaseMaster" cm WHERE ${cutoff}`)), all);
});

test("runGuardedQuery applies the scope to model-written SQL against any table", async () => {
  const rows = await runGuardedQuery(`SELECT COUNT(DISTINCT "PersonID")::int AS n FROM "Accused"`, { districtId: MYSURU });
  const all = await count(prisma, `SELECT COUNT(DISTINCT "PersonID")::int n FROM "Accused"`);
  // A strict inequality is safe here: an insert can only raise the unscoped side.
  assert.ok(Number(rows[0].n) < all);
});
