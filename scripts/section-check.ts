// Does the section suggester actually recover the sections a case was booked
// under? Takes real cases, hides their sections (the case itself is dropped from
// the evidence, or it would nominate itself), asks for suggestions from the
// brief facts alone, and reports hit rates.
//   npm run sections -- --n 60
//   npm run sections -- --n 40 --head 2 --no-head   (retrieval without the head hint)
import "dotenv/config";
import { prisma } from "../lib/db";
import { suggestSections, key } from "../lib/section-suggest";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

type Sample = { id: number; crimeNo: string | null; briefFacts: string; head: number | null; sections: string[] };

async function sample(n: number, head: number | null): Promise<Sample[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: number; crimeNo: string | null; briefFacts: string; head: number | null; sections: string[] }[]>(
    `SELECT cm."CaseMasterID" as id, cm."CrimeNo" as "crimeNo", cm."BriefFacts" as "briefFacts",
            cm."CrimeMajorHeadID" as head,
            array_agg(a."ActCode" || '|' || a."SectionCode") as sections
     FROM "CaseMaster" cm
     JOIN "ActSectionAssociation" a ON a."CaseMasterID" = cm."CaseMasterID"
     WHERE cm."BriefFactsEmbedding" IS NOT NULL AND length(cm."BriefFacts") > 40
       ${head ? `AND cm."CrimeMajorHeadID" = ${Math.floor(head)}` : ""}
     GROUP BY 1, 2, 3, 4
     -- Deterministic pseudo-random pick: same sample every run, so two tunings
     -- of the ranking are compared on the same cases.
     ORDER BY md5(cm."CaseMasterID"::text)
     LIMIT ${Math.floor(n)}`
  );
  return rows;
}

async function main() {
  const n = Number(arg("n")) || 50;
  const head = Number(arg("head")) || null;
  const useHead = !has("no-head");
  const topN = Number(arg("top")) || 3;

  const cases = await sample(n, head);
  console.log(`${cases.length} case(s), suggesting top ${topN}${useHead ? " with" : " without"} the crime-head hint\n`);

  let top1 = 0, topK = 0, any = 0, empty = 0;
  const t0 = Date.now();
  for (const c of cases) {
    const { suggestions, basedOnCases } = await suggestSections(c.briefFacts, {
      crimeMajorHeadId: useHead ? c.head : null,
      excludeCaseIds: [c.id],
      topN,
    });
    if (suggestions.length === 0) empty++;
    const ranked = suggestions.map(key);
    const truth = new Set(c.sections);
    const hit1 = ranked.length > 0 && truth.has(ranked[0]);
    const hitK = ranked.some((s) => truth.has(s));
    if (hit1) top1++;
    if (hitK) topK++;
    if (suggestions.length > 0) any++;
    const mark = hit1 ? "✔1" : hitK ? `✔${ranked.findIndex((s) => truth.has(s)) + 1}` : "✘ ";
    console.log(
      `${mark}  ${(c.crimeNo ?? `#${c.id}`).padEnd(16)} truth ${[...truth].join(",").padEnd(18)} ` +
        `→ ${ranked.map((s, i) => `${s}(${(suggestions[i].confidence * 100).toFixed(0)}%)`).join(" ") || "-"}  [${basedOnCases} nbrs]`
    );
  }

  const pct = (k: number) => `${((k / Math.max(1, cases.length)) * 100).toFixed(1)}%`;
  console.log(`\ntop-1 recovery   ${top1}/${cases.length}  ${pct(top1)}`);
  console.log(`top-${topN} recovery   ${topK}/${cases.length}  ${pct(topK)}`);
  console.log(`answered         ${any}/${cases.length}   (${empty} declined to guess)`);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s for ${cases.length} suggestions`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
