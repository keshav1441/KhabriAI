// Walks the correction loop end to end: a thumbs-down, a reviewed correction,
// and the same question retrieving the corrected example afterwards.
//   npm run feedback
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordFeedback, reviewFeedback, feedbackStats } from "../lib/feedback";
import { findSimilar } from "../lib/rag";
import { invalidateLearnedExamples, deactivateLearnedExample } from "../lib/learned-examples";

const QUESTION = "Which police stations in Mysuru filed the most chargesheets last quarter?";
const CORRECTED = `SELECT u."UnitName", COUNT(DISTINCT cd."CaseMasterID") AS chargesheets
FROM "ChargesheetDetails" cd
JOIN "CaseMaster" cm ON cm."CaseMasterID" = cd."CaseMasterID"
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
WHERE d."DistrictName" = 'Mysuru'
  AND cm."CrimeRegisteredDate" >= NOW() - INTERVAL '3 months'
GROUP BY u."UnitName"
ORDER BY chargesheets DESC`;

const keep = process.argv.includes("--keep");

async function main() {
  const user = await prisma.khabriUser.findFirst({ select: { id: true, email: true } });
  if (!user) throw new Error("no users in the database");

  const before = await findSimilar(QUESTION, 3);
  console.log("retrieved BEFORE the correction:");
  for (const e of before) console.log(`  ${e.score.toFixed(3)}  ${e.question}`);

  const fb = await recordFeedback({
    userId: user.id,
    vote: "down",
    messageId: `check-${Date.now()}`,
    question: QUESTION,
    answer: "It counted cases, not chargesheets.",
    sql: `SELECT COUNT(*) FROM "CaseMaster"`,
    tools: ["queryDatabase", "searchRelatedCases"],
    comment: "Counted cases instead of chargesheets, and ignored the quarter.",
  });
  console.log(`\nthumbs-down recorded as ${fb.id} (status ${fb.status})`);

  const review = await reviewFeedback({ id: fb.id, action: "approve", correctedSql: CORRECTED, reviewerId: user.id });
  console.log("review:", review);
  if (!review.ok) throw new Error("approval failed");

  invalidateLearnedExamples();
  const after = await findSimilar(QUESTION, 3);
  console.log("\nretrieved AFTER the correction:");
  for (const e of after) console.log(`  ${e.score.toFixed(3)}  ${e.question}`);
  const learnedFirst = after[0]?.question === QUESTION;
  console.log(`\ncorrected example is now the top few-shot example: ${learnedFirst ? "yes" : "NO"}`);

  const stats = await feedbackStats(30);
  console.log(`\nstats: ${stats.totals.up}/${stats.totals.rated} positive (${stats.totals.satisfaction ?? "-"}%), ` +
    `${stats.pending} pending, ${stats.approved} approved, ${stats.learnedExamples} learned examples`);
  console.log("weak spots:", stats.weakSpots.map((w) => `${w.tool}:${w.down}`).join(", ") || "(none)");

  if (!keep) {
    if (review.learnedExampleId) await deactivateLearnedExample(review.learnedExampleId);
    await prisma.answerFeedback.delete({ where: { id: fb.id } });
    console.log("\ncleaned up (pass --keep to leave the example in place)");
  }
  await prisma.$disconnect();
  process.exit(learnedFirst ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
