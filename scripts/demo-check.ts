// Pre-demo assertions for docs/DEMO.md. Exit 1 if any anchor is missing.
//   npm run demo:check
import "dotenv/config";
import { prisma } from "../lib/db";
import { similarCasesTo } from "../lib/case-retrieval";

const DEMO_CASE = 13778;
const DEMO_OFFENDER = "KSP-P-00928";
const AMBIGUOUS_NAME = "Ravi";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

async function main() {
  const q = <T = Record<string, unknown>>(s: string, ...p: unknown[]) => prisma.$queryRawUnsafe<T[]>(s, ...p);

  const [{ max }] = await q<{ max: Date | null }>(`SELECT MAX("CrimeRegisteredDate") AS max FROM "CaseMaster"`);
  const ageDays = max ? Math.round((Date.now() - new Date(max).getTime()) / 86_400_000) : 999;
  check("newest FIR is recent (last-30-days questions have data)", ageDays <= 3, `newest is ${ageDays} day(s) old`);

  const [rising] = await q<{ n: number }>(`SELECT COUNT(*)::int n FROM "CaseMaster" WHERE "CrimeRegisteredDate" >= DATE_TRUNC('month', NOW())`);
  check("this month has FIRs", rising.n > 0, `${rising.n} this month`);

  const [src] = await q<{ n: number; embedded: boolean; status: string; district: string }>(
    `SELECT 1 AS n, ("BriefFactsEmbedding" IS NOT NULL) embedded, cs."CaseStatusName" status, d."DistrictName" district
     FROM "CaseMaster" cm JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE cm."CaseMasterID" = $1`, DEMO_CASE);
  check(`demo case #${DEMO_CASE} exists and is embedded`, Boolean(src?.embedded), src ? `${src.district}, ${src.status}` : "missing");

  const [series] = await q<{ cases: number; districts: number; open: number }>(
    `SELECT COUNT(DISTINCT cm."CaseMasterID")::int cases, COUNT(DISTINCT u."DistrictID")::int districts, COUNT(*) FILTER (WHERE cm."CaseStatusID" = 1)::int open
     FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID" JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     WHERE a."PersonID" = $1 AND cm."CrimeMajorHeadID" = 2`, DEMO_OFFENDER);
  check(`series ${DEMO_OFFENDER} spans >= 3 districts with open cases`, series.districts >= 3 && series.open >= 2, `${series.cases} cases, ${series.districts} districts, ${series.open} open`);

  const links = await similarCasesTo(DEMO_CASE, { topK: 10 });
  const cross = links.filter((c) => c.district !== src?.district);
  check("MO links from the demo case include other districts", cross.length >= 3, `${links.length} links, ${cross.length} cross-district, top ${links[0] ? Math.round(links[0].score * 100) : 0}%`);

  const [amb] = await q<{ n: number }>(`SELECT COUNT(DISTINCT "AccusedName")::int n FROM "Accused" WHERE lower("AccusedName") LIKE $1`, `${AMBIGUOUS_NAME.toLowerCase()}%`);
  check(`"${AMBIGUOUS_NAME}" is ambiguous (> 3 distinct people)`, amb.n > 3, `${amb.n} people`);

  const [emb] = await q<{ n: number; total: number }>(`SELECT COUNT(*) FILTER (WHERE "BriefFactsEmbedding" IS NOT NULL)::int n, COUNT(*)::int total FROM "CaseMaster"`);
  check("corpus embedded", emb.n / emb.total >= 0.9, `${emb.n}/${emb.total} (${Math.round((100 * emb.n) / emb.total)}%)`);

  console.log(failed ? `\n${failed} check(s) failed` : "\nall demo anchors present");
  process.exitCode = failed ? 1 : 0;
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
