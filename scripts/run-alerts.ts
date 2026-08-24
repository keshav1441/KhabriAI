// Runs the alert detectors once and prints what each officer would be pushed.
//   npm run alerts
import "dotenv/config";
import { prisma } from "../lib/db";
import { generateAlerts, listAlerts } from "../lib/alerts";

async function main() {
  const t0 = Date.now();
  const result = await generateAlerts();
  console.log(`generated in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, result);

  const users = await prisma.khabriUser.findMany({ select: { id: true, email: true, role: true, districtId: true } });
  for (const u of users.slice(0, 5)) {
    const { alerts, unread, last24h } = await listAlerts(u.id, 5);
    console.log(`\n${u.email} [${u.role}${u.districtId ? ` d${u.districtId}` : ""}] unread=${unread} last24h=${last24h}`);
    for (const a of alerts) console.log(`  · ${a.severity.padEnd(8)} ${a.kind.padEnd(15)} ${a.title} — ${a.detail.slice(0, 110)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
