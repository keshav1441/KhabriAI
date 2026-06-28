/**
 * Inserts victims, accused, complainants, arrests, chargesheets
 * for all CaseMaster rows that have no Victim yet.
 * Safe to re-run — uses ON CONFLICT DO NOTHING for Act/Section associations.
 */
import "dotenv/config";
import { Pool, PoolClient } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIRST_NAMES = ["Ravi","Suresh","Mahesh","Ramesh","Ganesh","Kumar","Praveen","Santosh","Nagaraj","Shivakumar","Manjunath","Rajesh","Venkatesh","Anand","Prakash","Lakshmi","Savitha","Geetha","Suma","Usha","Kavitha","Meena","Rekha","Vijaya","Shobha","Deepa","Anitha","Latha","Radha","Priya","Arjun","Kiran","Mohan","Srinivas","Basavaraj","Nagesh","Pavan","Arun","Vikram","Rohit"];
const LAST_NAMES  = ["Gowda","Reddy","Naik","Rao","Sharma","Kumar","Singh","Patil","Hegde","Shetty","Nair","Murthy","Patel","Joshi","Kulkarni","Kamath","Bhat","Desai","Nayak","Pillai"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randName(): string { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }
function randAge(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min)); }

function bulkInsert(table: string, cols: string[], rows: unknown[][]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const placeholders = rows.map(row => {
    const start = params.length;
    params.push(...row);
    return `(${row.map((_, i) => `$${start + i + 1}`).join(",")})`;
  });
  const quotedCols = cols.map(c => `"${c}"`).join(",");
  return { sql: `INSERT INTO "${table}"(${quotedCols}) VALUES ${placeholders.join(",")}`, params };
}

async function batchInsert(client: PoolClient, table: string, cols: string[], allRows: unknown[][], batchSize = 200): Promise<void> {
  for (let i = 0; i < allRows.length; i += batchSize) {
    const chunk = allRows.slice(i, i + batchSize);
    const { sql, params } = bulkInsert(table, cols, chunk);
    await client.query(sql, params);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    // Load lookup IDs
    const { rows: occupRows } = await client.query(`SELECT "OccupationID" FROM "OccupationMaster"`);
    const { rows: relRows }   = await client.query(`SELECT "ReligionID" FROM "ReligionMaster"`);
    const { rows: casteRows } = await client.query(`SELECT "caste_master_id" FROM "CasteMaster"`);
    const { rows: statusRows } = await client.query(`SELECT "CaseStatusID" FROM "CaseStatusMaster" ORDER BY "CaseStatusID"`);
    const occupIds  = occupRows.map((r: { OccupationID: number }) => r.OccupationID);
    const relIds    = relRows.map((r: { ReligionID: number }) => r.ReligionID);
    const casteIds  = casteRows.map((r: { caste_master_id: number }) => r.caste_master_id);

    const { rows: empRows } = await client.query(`SELECT "EmployeeID","UnitID" FROM "Employee"`);
    const { rows: unitRows } = await client.query(`SELECT "UnitID","DistrictID" FROM "Unit"`);
    const { rows: courtRows } = await client.query(`SELECT "CourtID","DistrictID" FROM "Court"`);
    const { rows: crimeRows } = await client.query(`
      SELECT cm."CaseMasterID", cm."CrimeRegisteredDate", cm."PoliceStationID",
             cm."CrimeMajorHeadID", cm."CrimeMinorHeadID", cm."CaseStatusID",
             cm."PolicePersonID", cm."CourtID",
             ch."CrimeGroupName", csh."CrimeHeadName"
      FROM "CaseMaster" cm
      LEFT JOIN "Victim" v ON v."CaseMasterID" = cm."CaseMasterID"
      LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
      WHERE v."VictimMasterID" IS NULL
      ORDER BY cm."CaseMasterID"
    `);

    if (!crimeRows.length) {
      console.log("All cases already have dependents — nothing to do.");
      return;
    }
    console.log(`Adding dependents for ${crimeRows.length} cases...`);

    const { rows: actRows } = await client.query(`SELECT "ActCode","SectionCode" FROM "Section"`);
    const actSectionPairs = actRows.map((r: { ActCode: string; SectionCode: string }) => [r.ActCode, r.SectionCode]);

    const victimRows:     unknown[][] = [];
    const accusedRows:    unknown[][] = [];
    const complainantRows:unknown[][] = [];
    const actSectionRows: unknown[][] = [];
    const arrestRows:     unknown[][] = [];
    const csRows:         unknown[][] = [];

    const unitDistrictMap = Object.fromEntries(unitRows.map((u: { UnitID: number; DistrictID: number }) => [u.UnitID, u.DistrictID]));
    const courtDistrictMap = Object.fromEntries(courtRows.map((c: { CourtID: number; DistrictID: number }) => [c.DistrictID, c.CourtID]));
    const empUnitMap: Record<number, number[]> = {};
    for (const e of empRows) {
      if (!empUnitMap[e.UnitID]) empUnitMap[e.UnitID] = [];
      empUnitMap[e.UnitID].push(e.EmployeeID);
    }

    const chargeshetStatusID = statusRows[1]?.CaseStatusID; // "Charge Sheeted"

    for (const row of crimeRows) {
      const caseID = row.CaseMasterID;
      const crimeDate = new Date(row.CrimeRegisteredDate);
      const unitID = row.PoliceStationID;
      const districtID = unitDistrictMap[unitID];

      victimRows.push([caseID, randName(), randAge(15, 75), Math.random() > 0.35 ? 1 : 2, "0"]);

      const numAccused = Math.random() < 0.3 ? 2 : 1;
      for (let a = 0; a < numAccused; a++) {
        accusedRows.push([caseID, randName(), randAge(18, 63), Math.random() > 0.15 ? 1 : 2, `A${a+1}`]);
      }

      complainantRows.push([caseID, randName(), randAge(20, 70), pick(occupIds), pick(relIds), pick(casteIds), Math.random() > 0.4 ? 1 : 2]);

      // Pick act/section pair
      const pair = pick(actSectionPairs);
      actSectionRows.push([caseID, pair[0], pair[1], 1, 1]);

      if (Math.random() < 0.3 && districtID) {
        const empArr = empUnitMap[unitID] ?? empRows.slice(0, 5).map((e: { EmployeeID: number }) => e.EmployeeID);
        const courtID = courtDistrictMap[districtID] ?? null;
        const arrestDate = new Date(crimeDate.getTime() + Math.random() * 30 * 24 * 3600 * 1000);
        // placeholder accusedID = null (will fill after insert)
        arrestRows.push([caseID, 1, arrestDate, 1, districtID, unitID, pick(empArr), courtID]);
      }

      if (row.CaseStatusID === chargeshetStatusID) {
        const empArr = empUnitMap[unitID] ?? [];
        csRows.push([caseID, new Date(crimeDate.getTime() + Math.random() * 90 * 24 * 3600 * 1000), "A", pick(empArr) ?? row.PolicePersonID]);
      }
    }

    await batchInsert(client, "Victim", ["CaseMasterID","VictimName","AgeYear","GenderID","VictimPolice"], victimRows);
    console.log(`  Victims: ${victimRows.length}`);

    // Accused: insert with RETURNING to get IDs for ArrestSurrender
    const firstAccusedByCaseID: Record<number, number> = {};
    for (let i = 0; i < accusedRows.length; i += 200) {
      const chunk = accusedRows.slice(i, i + 200);
      const { sql, params } = bulkInsert("Accused", ["CaseMasterID","AccusedName","AgeYear","GenderID","PersonID"], chunk);
      const { rows } = await client.query(sql + ' RETURNING "AccusedMasterID","CaseMasterID"', params);
      for (const r of rows) {
        if (!firstAccusedByCaseID[r.CaseMasterID]) firstAccusedByCaseID[r.CaseMasterID] = r.AccusedMasterID;
      }
    }
    console.log(`  Accused: ${accusedRows.length}`);

    await batchInsert(client, "ComplainantDetails", ["CaseMasterID","ComplainantName","AgeYear","OccupationID","ReligionID","CasteID","GenderID"], complainantRows);
    console.log(`  Complainants: ${complainantRows.length}`);

    for (let i = 0; i < actSectionRows.length; i += 200) {
      const chunk = actSectionRows.slice(i, i + 200);
      const { sql, params } = bulkInsert("ActSectionAssociation", ["CaseMasterID","ActCode","SectionCode","ActOrderID","SectionOrderID"], chunk);
      await client.query(sql + " ON CONFLICT DO NOTHING", params);
    }
    console.log(`  ActSections: ${actSectionRows.length}`);

    const arrestRowsFull = arrestRows.map(r => {
      const caseID = r[0] as number;
      return [...r, firstAccusedByCaseID[caseID] ?? null, true, false];
    });
    if (arrestRowsFull.length > 0) {
      await batchInsert(client, "ArrestSurrender",
        ["CaseMasterID","ArrestSurrenderTypeID","ArrestSurrenderDate","ArrestSurrenderStateId","ArrestSurrenderDistrictId","PoliceStationID","IOID","CourtID","AccusedMasterID","IsAccused","IsComplainantAccused"],
        arrestRowsFull);
    }
    console.log(`  Arrests: ${arrestRowsFull.length}`);

    if (csRows.length > 0) {
      await batchInsert(client, "ChargesheetDetails", ["CaseMasterID","csdate","cstype","PolicePersonID"], csRows);
    }
    console.log(`  Chargesheets: ${csRows.length}`);

    console.log(`\nDependents seeded for ${crimeRows.length} cases.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error("Seed error:", e.message); process.exit(1); });
