// Set an officer's data scope.
//   npx tsx scripts/set-scope.ts --email=sho.mysuru@ksp.test --district=Mysuru   # SHO bound to one district
//   npx tsx scripts/set-scope.ts --email=hq@ksp.test --hq                         # statewide
import "dotenv/config";
import { prisma } from "../lib/db";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const email = arg("email");
const district = arg("district");
const hq = process.argv.includes("--hq");

async function main() {
  if (!email || (!district && !hq)) { console.log("usage: --email=<email> (--district=<DistrictName> | --hq)"); process.exit(1); }
  const user = await prisma.khabriUser.findUnique({ where: { email } });
  if (!user) { console.log(`no user ${email}`); process.exit(1); }
  if (hq) {
    await prisma.khabriUser.update({ where: { email }, data: { role: "HQ", districtId: null } });
    console.log(`${email}: HQ (statewide)`);
    return;
  }
  const d = await prisma.district.findFirst({ where: { DistrictName: { equals: district, mode: "insensitive" } } });
  if (!d) { console.log(`unknown district ${district}`); process.exit(1); }
  await prisma.khabriUser.update({ where: { email }, data: { role: "SHO", districtId: d.DistrictID } });
  console.log(`${email}: SHO, ${d.DistrictName} (DistrictID ${d.DistrictID})`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
