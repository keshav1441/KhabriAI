// Prints the predictive hotspot forecast, to check the numbers without the map.
//   npm run hotspots
import "dotenv/config";
import { prisma } from "../lib/db";
import { computeHotspots } from "../lib/hotspot-forecast";

async function main() {
  const t0 = Date.now();
  const f = await computeHotspots(30);
  console.log(`${f.districts.length} districts, ${f.priorities.length} priorities in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`months fitted: ${f.months.join(", ")}`);
  console.log(`\ntop districts by projected next-30-day load:`);
  for (const d of f.districts.slice(0, 8)) {
    console.log(`  ${d.district.padEnd(18)} observed ${String(d.observed30).padStart(3)} → predicted ${String(d.predicted30).padStart(3)} (${d.delta >= 0 ? "+" : ""}${d.deltaPct}%) conf=${d.confidence} drivers=${d.drivers.map((x) => `${x.crimeGroup} +${x.slopePerMonth}`).join(", ") || "-"}`);
  }
  console.log(`\npatrol priorities:`);
  for (const p of f.priorities.slice(0, 6)) {
    console.log(`  #${p.rank} [${p.confidence} fit=${p.fit}] ${p.reason}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
