import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { bridgeNeonUser } from "../lib/neon-auth";

const EMAIL = "bridge.test@ksp.test";
after(async () => { await prisma.khabriUser.deleteMany({ where: { email: EMAIL } }); await prisma.$disconnect(); });

test("a first Neon sign-in creates an HQ user from the identity's name", async () => {
  await prisma.khabriUser.deleteMany({ where: { email: EMAIL } });
  const u = await bridgeNeonUser({ email: "Bridge.Test@ksp.test", name: "Asha Rao" });
  assert.deepEqual(u, { firstName: "Asha", lastName: "Rao", email: EMAIL, role: "HQ", districtName: null });
});

test("a repeat sign-in keeps the existing role and district", async () => {
  await prisma.khabriUser.update({ where: { email: EMAIL }, data: { role: "SHO", districtId: 3 } });
  const u = await bridgeNeonUser({ email: EMAIL, name: "Different Name" });
  assert.equal(u.role, "SHO");
  assert.equal(u.districtName, "Mysuru");
  assert.equal(u.firstName, "Asha");
});

test("a posting chosen at sign-up is applied when the account is first created, never afterwards", async () => {
  const EMAIL2 = "bridge.posting@ksp.test";
  await prisma.khabriUser.deleteMany({ where: { email: EMAIL2 } });
  try {
    const created = await bridgeNeonUser({ email: EMAIL2, name: "Kiran N" }, { role: "SHO", districtId: 3 });
    assert.equal(created.role, "SHO");
    assert.equal(created.districtName, "Mysuru");
    const again = await bridgeNeonUser({ email: EMAIL2, name: "Kiran N" }, { role: "SHO", districtId: 1 });
    assert.equal(again.districtName, "Mysuru", "an existing account's posting is not changed by a later sign-in");
  } finally {
    await prisma.khabriUser.deleteMany({ where: { email: EMAIL2 } });
  }
});
