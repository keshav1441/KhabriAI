import "dotenv/config";
import { Pool, PoolClient } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TOTAL_CASES = 20000;
const BATCH = 50;

// ─── Reference data ────────────────────────────────────────────────────────────

const DISTRICTS = [
  { name: "Bengaluru Urban",  lat: 12.9716, lng: 77.5946 },
  { name: "Bengaluru Rural",  lat: 13.1986, lng: 77.7066 },
  { name: "Mysuru",           lat: 12.2958, lng: 76.6394 },
  { name: "Tumakuru",         lat: 13.3409, lng: 77.1010 },
  { name: "Kolar",            lat: 13.1367, lng: 78.1297 },
  { name: "Chikkaballapura",  lat: 13.4355, lng: 77.7315 },
  { name: "Ramanagara",       lat: 12.7157, lng: 77.2811 },
  { name: "Mandya",           lat: 12.5218, lng: 76.8951 },
  { name: "Hassan",           lat: 13.0033, lng: 76.1004 },
  { name: "Chamarajanagara",  lat: 11.9261, lng: 76.9438 },
  { name: "Kodagu",           lat: 12.4244, lng: 75.7382 },
  { name: "Dakshina Kannada", lat: 12.8438, lng: 74.9870 },
  { name: "Udupi",            lat: 13.3409, lng: 74.7421 },
  { name: "Shivamogga",       lat: 13.9299, lng: 75.5681 },
  { name: "Davangere",        lat: 14.4644, lng: 75.9218 },
  { name: "Chikkamagaluru",   lat: 13.3161, lng: 75.7720 },
  { name: "Uttara Kannada",   lat: 14.7941, lng: 74.6862 },
  { name: "Dharwad",          lat: 15.4589, lng: 75.0078 },
  { name: "Belagavi",         lat: 15.8497, lng: 74.4977 },
  { name: "Gadag",            lat: 15.4316, lng: 75.6244 },
  { name: "Haveri",           lat: 14.7939, lng: 75.3994 },
  { name: "Vijayapura",       lat: 16.8302, lng: 75.7100 },
  { name: "Bagalkote",        lat: 16.1826, lng: 75.6960 },
  { name: "Ballari",          lat: 15.1394, lng: 76.9214 },
  { name: "Vijayanagara",     lat: 15.3350, lng: 76.4600 },
  { name: "Koppal",           lat: 15.3508, lng: 76.1547 },
  { name: "Raichur",          lat: 16.2120, lng: 77.3439 },
  { name: "Yadgir",           lat: 16.7710, lng: 77.1380 },
  { name: "Kalaburagi",       lat: 17.3297, lng: 76.8343 },
  { name: "Bidar",            lat: 17.9104, lng: 77.5199 },
];

const STATION_SUFFIXES = ["City PS", "Rural PS", "Traffic PS", "Market PS", "North PS", "South PS", "East PS"];

const CRIME_HEADS = [
  { group: "Crimes Against Body",     subs: ["Murder","Attempt to Murder","Culpable Homicide","Grievous Hurt","Simple Hurt","Kidnapping"],               actCode: "IPC",    sections: ["302","307","304","326","323","363"], weight: 20, heinous: true  },
  { group: "Crimes Against Property", subs: ["Theft","Burglary","Robbery","Dacoity","Cheating","Criminal Breach of Trust"],                               actCode: "IPC",    sections: ["379","454","392","395","420","406"], weight: 35, heinous: false },
  { group: "Crimes Against Women",    subs: ["Rape","Assault on Women","Domestic Violence","Dowry Harassment","Eve Teasing","Abduction"],                 actCode: "IPC",    sections: ["376","354","498A","304B","509","366"], weight: 15, heinous: true },
  { group: "Cybercrimes",             subs: ["Identity Theft","Online Fraud","Hacking","Cyberstalking","Data Theft"],                                      actCode: "IT_ACT", sections: ["66C","66D","66","67","43"],           weight: 10, heinous: false },
  { group: "Economic Offences",       subs: ["Bank Fraud","Investment Fraud","Forgery","Counterfeiting","Tax Evasion"],                                    actCode: "IPC",    sections: ["420","467","468","471","406"],        weight: 8,  heinous: false },
  { group: "Road Accidents",          subs: ["Fatal Accident","Grievous Injury Accident","Simple Injury Accident","Hit and Run"],                          actCode: "MV_ACT", sections: ["304A","279","338","337"],             weight: 7,  heinous: false },
  { group: "Narcotics",               subs: ["Cannabis Possession","Trafficking","Peddling","Consumption"],                                                actCode: "NDPS",   sections: ["20","21","22","27"],                  weight: 3,  heinous: false },
  { group: "Other IPC Crimes",        subs: ["Rioting","Unlawful Assembly","Extortion","Criminal Intimidation"],                                           actCode: "IPC",    sections: ["147","143","384","506"],              weight: 2,  heinous: false },
];

const FIRST_NAMES = ["Ravi","Suresh","Mahesh","Ramesh","Ganesh","Kumar","Praveen","Santosh","Nagaraj","Shivakumar","Manjunath","Rajesh","Venkatesh","Anand","Prakash","Lakshmi","Savitha","Geetha","Suma","Usha","Kavitha","Meena","Rekha","Vijaya","Shobha","Deepa","Anitha","Latha","Radha","Priya","Arjun","Kiran","Mohan","Srinivas","Basavaraj","Nagesh","Pavan","Arun","Vikram","Rohit"];
const LAST_NAMES  = ["Gowda","Reddy","Naik","Rao","Sharma","Kumar","Singh","Patil","Hegde","Shetty","Nair","Murthy","Patel","Joshi","Kulkarni","Kamath","Bhat","Desai","Nayak","Pillai","Swamy","Raju","Prasad","Verma","Gupta"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randFloat(base: number, spread: number): number { return +(base + (Math.random() - 0.5) * spread).toFixed(6); }
function randDate(monthsBack: number): Date {
  return new Date(Date.now() - Math.random() * monthsBack * 30 * 24 * 3600 * 1000);
}
function randName(): string { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }
function randAge(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min)); }
function weightedIdx(weights: number[]): number {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

// Build parameterized bulk INSERT: returns { sql, params }
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

async function batchInsert(client: PoolClient, table: string, cols: string[], allRows: unknown[][], batchSize = BATCH): Promise<void> {
  for (let i = 0; i < allRows.length; i += batchSize) {
    const chunk = allRows.slice(i, i + batchSize);
    const { sql, params } = bulkInsert(table, cols, chunk);
    await client.query(sql, params);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Seeding Khabri AI — ${TOTAL_CASES} FIR cases (batch mode)...`);

    await client.query(`TRUNCATE TABLE
      "ChargesheetDetails","ArrestSurrender","ActSectionAssociation",
      "ComplainantDetails","Accused","Victim","CaseMaster",
      "CrimeHeadActSection","Section","Act",
      "CasteMaster","ReligionMaster","OccupationMaster",
      "Court","CaseStatusMaster","CrimeSubHead","CrimeHead",
      "GravityOffence","CaseCategory",
      "Employee","Designation","Rank","Unit","UnitType",
      "District","State"
      RESTART IDENTITY CASCADE`);
    console.log("  Cleared existing data");

    // ── Lookup tables (small — individual inserts fine) ──────────────────────

    const { rows: [state] } = await client.query(
      `INSERT INTO "State"("StateName","NationalityID","Active") VALUES('Karnataka',1,true) RETURNING "StateID"`);
    const stateID: number = state.StateID;

    const districtIds: number[] = [];
    for (const d of DISTRICTS) {
      const { rows: [r] } = await client.query(
        `INSERT INTO "District"("DistrictName","StateID","Active") VALUES($1,$2,true) RETURNING "DistrictID"`,
        [d.name, stateID]);
      districtIds.push(r.DistrictID);
    }

    const { rows: [ut] } = await client.query(
      `INSERT INTO "UnitType"("UnitTypeName","CityDistState","Hierarchy","Active") VALUES('Police Station','City',4,true) RETURNING "UnitTypeID"`);
    const unitTypeID: number = ut.UnitTypeID;

    const units: { UnitID: number; DistrictID: number; lat: number; lng: number }[] = [];
    for (let di = 0; di < DISTRICTS.length; di++) {
      const d = DISTRICTS[di];
      for (const suffix of STATION_SUFFIXES) {
        const { rows: [r] } = await client.query(
          `INSERT INTO "Unit"("UnitName","TypeID","StateID","DistrictID","Active") VALUES($1,$2,$3,$4,true) RETURNING "UnitID"`,
          [`${d.name} ${suffix}`, unitTypeID, stateID, districtIds[di]]);
        units.push({ UnitID: r.UnitID, DistrictID: districtIds[di], lat: d.lat, lng: d.lng });
      }
    }
    console.log(`  Created ${districtIds.length} districts, ${units.length} stations`);

    const ranks = [["Constable",5],["Head Constable",4],["ASI",3],["Sub Inspector",2],["Inspector",1]];
    const rankIds: number[] = [];
    for (const [name, h] of ranks) {
      const { rows: [r] } = await client.query(
        `INSERT INTO "Rank"("RankName","Hierarchy","Active") VALUES($1,$2,true) RETURNING "RankID"`, [name, h]);
      rankIds.push(r.RankID);
    }

    const desigs = [["Constable",5],["Investigating Officer",3],["Station House Officer",2],["Circle Inspector",1],["Head Constable",4]];
    const desigIds: number[] = [];
    for (const [name, s] of desigs) {
      const { rows: [r] } = await client.query(
        `INSERT INTO "Designation"("DesignationName","SortOrder","Active") VALUES($1,$2,true) RETURNING "DesignationID"`, [name, s]);
      desigIds.push(r.DesignationID);
    }

    const employees: { EmployeeID: number; UnitID: number; DistrictID: number }[] = [];
    for (let di = 0; di < DISTRICTS.length; di++) {
      const districtID = districtIds[di];
      const distUnits = units.filter(u => u.DistrictID === districtID);
      for (let i = 0; i < 5; i++) {
        const unit = distUnits[i % distUnits.length];
        const { rows: [r] } = await client.query(
          `INSERT INTO "Employee"("DistrictID","UnitID","RankID","DesignationID","KGID","FirstName","GenderID") VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING "EmployeeID"`,
          [districtID, unit.UnitID, pick(rankIds), pick(desigIds), `KG${Math.floor(Math.random()*9000000+1000000)}`, randName(), Math.random()>0.2?1:2]);
        employees.push({ EmployeeID: r.EmployeeID, UnitID: unit.UnitID, DistrictID: districtID });
      }
    }

    const cats = ["FIR","UDR","Zero FIR","PAR"];
    const catIds: number[] = [];
    for (const v of cats) {
      const { rows: [r] } = await client.query(`INSERT INTO "CaseCategory"("LookupValue") VALUES($1) RETURNING "CaseCategoryID"`, [v]);
      catIds.push(r.CaseCategoryID);
    }
    const { rows: [hein] }    = await client.query(`INSERT INTO "GravityOffence"("LookupValue") VALUES('Heinous') RETURNING "GravityOffenceID"`);
    const { rows: [nonHein] } = await client.query(`INSERT INTO "GravityOffence"("LookupValue") VALUES('Non-Heinous') RETURNING "GravityOffenceID"`);

    const statuses = ["Under Investigation","Charge Sheeted","Closed","False Case"];
    const statusIds: number[] = [];
    for (const v of statuses) {
      const { rows: [r] } = await client.query(`INSERT INTO "CaseStatusMaster"("CaseStatusName") VALUES($1) RETURNING "CaseStatusID"`, [v]);
      statusIds.push(r.CaseStatusID);
    }
    const occupIds: number[] = [];
    for (const v of ["Farmer","Government Employee","Private Employee","Student","Business","Daily Wage Labour","Unemployed"]) {
      const { rows: [r] } = await client.query(`INSERT INTO "OccupationMaster"("OccupationName") VALUES($1) RETURNING "OccupationID"`, [v]);
      occupIds.push(r.OccupationID);
    }
    const relIds: number[] = [];
    for (const v of ["Hindu","Muslim","Christian","Jain","Buddhist","Other"]) {
      const { rows: [r] } = await client.query(`INSERT INTO "ReligionMaster"("ReligionName") VALUES($1) RETURNING "ReligionID"`, [v]);
      relIds.push(r.ReligionID);
    }
    const casteIds: number[] = [];
    for (const v of ["General","OBC","SC","ST","Others"]) {
      const { rows: [r] } = await client.query(`INSERT INTO "CasteMaster"("caste_master_name") VALUES($1) RETURNING "caste_master_id"`, [v]);
      casteIds.push(r.caste_master_id);
    }

    const courtByDistrict: Record<number, number> = {};
    for (let di = 0; di < DISTRICTS.length; di++) {
      const { rows: [r] } = await client.query(
        `INSERT INTO "Court"("CourtName","DistrictID","StateID","Active") VALUES($1,$2,$3,true) RETURNING "CourtID"`,
        [`${DISTRICTS[di].name} District Court`, districtIds[di], stateID]);
      courtByDistrict[districtIds[di]] = r.CourtID;
    }

    const actDefs = [["IPC","Indian Penal Code, 1860","IPC"],["IT_ACT","Information Technology Act, 2000","IT Act"],["NDPS","Narcotic Drugs and Psychotropic Substances Act, 1985","NDPS"],["MV_ACT","Motor Vehicles Act, 1988","MV Act"]];
    for (const [code, desc, short] of actDefs) {
      await client.query(`INSERT INTO "Act"("ActCode","ActDescription","ShortName","Active") VALUES($1,$2,$3,true)`, [code, desc, short]);
    }
    const sections = [
      ["IPC","302","Murder"],["IPC","307","Attempt to Murder"],["IPC","304","Culpable Homicide"],["IPC","326","Grievous Hurt"],["IPC","323","Simple Hurt"],["IPC","363","Kidnapping"],
      ["IPC","376","Rape"],["IPC","354","Assault on Women"],["IPC","498A","Domestic Violence"],["IPC","304B","Dowry Death"],["IPC","509","Eve Teasing"],["IPC","366","Abduction"],
      ["IPC","379","Theft"],["IPC","380","Theft in Dwelling"],["IPC","454","Lurking House Trespass"],["IPC","392","Robbery"],["IPC","395","Dacoity"],["IPC","420","Cheating"],["IPC","406","Criminal Breach of Trust"],
      ["IPC","467","Forgery"],["IPC","468","Forgery for Cheating"],["IPC","471","Using Forged Document"],["IPC","384","Extortion"],["IPC","147","Rioting"],["IPC","143","Unlawful Assembly"],["IPC","506","Criminal Intimidation"],
      ["IPC","304A","Death by Negligence"],["IPC","279","Rash Driving"],["IPC","338","Grievous Hurt by Negligence"],
      ["IT_ACT","66","Computer Related Offence"],["IT_ACT","66C","Identity Theft"],["IT_ACT","66D","Cheating by Impersonation"],["IT_ACT","67","Obscene Material"],["IT_ACT","43","Damage to Computer"],
      ["NDPS","20","Cannabis"],["NDPS","21","Manufactured Drugs"],["NDPS","22","Psychotropic Substances"],["NDPS","27","Consumption"],
      ["MV_ACT","304A","Death by Negligent Driving"],["MV_ACT","279","Rash and Negligent Driving"],["MV_ACT","338","Causing Grievous Hurt"],["MV_ACT","337","Causing Hurt"],
    ];
    for (const [act, sec, desc] of sections) {
      await client.query(`INSERT INTO "Section"("ActCode","SectionCode","SectionDescription","Active") VALUES($1,$2,$3,true)`, [act, sec, desc]);
    }

    const crimeHeadData: { CrimeHeadID: number; subs: string[]; actCode: string; sections: string[]; weight: number; heinous: boolean; subIds: number[] }[] = [];
    for (const ch of CRIME_HEADS) {
      const { rows: [r] } = await client.query(`INSERT INTO "CrimeHead"("CrimeGroupName","Active") VALUES($1,true) RETURNING "CrimeHeadID"`, [ch.group]);
      const subIds: number[] = [];
      for (let si = 0; si < ch.subs.length; si++) {
        const { rows: [sr] } = await client.query(
          `INSERT INTO "CrimeSubHead"("CrimeHeadID","CrimeHeadName","SeqID") VALUES($1,$2,$3) RETURNING "CrimeSubHeadID"`,
          [r.CrimeHeadID, ch.subs[si], si + 1]);
        subIds.push(sr.CrimeSubHeadID);
      }
      await client.query(`INSERT INTO "CrimeHeadActSection"("CrimeHeadID","ActCode","SectionCode") VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [r.CrimeHeadID, ch.actCode, ch.sections[0]]);
      crimeHeadData.push({ CrimeHeadID: r.CrimeHeadID, ...ch, subIds });
    }
    console.log("  Created crime heads, sub-heads, acts, sections");

    // ── Generate all case data in memory, then batch insert ──────────────────

    console.log(`Generating ${TOTAL_CASES} cases in memory...`);
    const weights = crimeHeadData.map(c => c.weight);

    const caseMasterRows: unknown[][] = [];
    const victimRows:     unknown[][] = [];
    const accusedRows:    unknown[][] = [];
    const complainantRows:unknown[][] = [];
    const actSectionRows: unknown[][] = [];
    const arrestRows:     unknown[][] = [];
    const csRows:         unknown[][] = [];

    // We need CaseMasterIDs — insert CaseMaster in batches and collect IDs
    // Then insert dependent tables

    console.log(`Inserting CaseMaster in batches of ${BATCH}...`);
    const allCaseIDs: number[] = [];

    // Store metadata per case for dependent inserts
    const caseMeta: { unit: typeof units[0]; ch: typeof crimeHeadData[0]; subIdx: number; statusIdx: number; crimeDate: Date; empID: number; courtID: number | null; arrested: boolean }[] = [];

    for (let i = 0; i < TOTAL_CASES; i++) {
      const unit = pick(units);
      const chIdx = weightedIdx(weights);
      const ch = crimeHeadData[chIdx];
      const subIdx = Math.floor(Math.random() * ch.subIds.length);
      const crimeDate = randDate(24);
      const year = crimeDate.getFullYear();
      const serial = String(i + 1).padStart(5, "0");
      const emp = employees.find(e => e.UnitID === unit.UnitID) ?? pick(employees);
      const courtID = courtByDistrict[unit.DistrictID] ?? null;

      // Real causal structure for the QuickML target: an arrest is the
      // practical precondition for a chargesheet, and more elapsed time
      // means more chance investigation has concluded. Heinous cases get
      // a modest arrest-priority bump. Without this, CaseStatus was drawn
      // from fixed global weights independent of every other field, which
      // made the seeded data unlearnable (AutoML: "columns does not
      // contribute much to the given target").
      const arrested = Math.random() < (ch.heinous ? 0.42 : 0.28);
      const daysElapsed = (Date.now() - crimeDate.getTime()) / (24 * 3600 * 1000);
      const timeFactor = Math.min(daysElapsed / 180, 1);
      const statusIdx = arrested
        ? weightedIdx([25, 20 + 60 * timeFactor, 20, 3]) // Under Investigation, Charge Sheeted, Closed, False Case
        : weightedIdx([55, 2, 30, 13]);

      caseMasterRows.push([
        `1${String(unit.DistrictID).padStart(4,"0")}${String(unit.UnitID).padStart(4,"0")}${year}${serial}`,
        `${year}${serial}`,
        crimeDate,
        emp.EmployeeID,
        unit.UnitID,
        catIds[0],
        ch.heinous ? hein.GravityOffenceID : nonHein.GravityOffenceID,
        ch.CrimeHeadID,
        ch.subIds[subIdx],
        statusIds[statusIdx],
        courtID,
        new Date(crimeDate.getTime() - Math.random() * 24 * 3600 * 1000),
        crimeDate,
        crimeDate,
        randFloat(unit.lat, 0.15),
        randFloat(unit.lng, 0.15),
        `${ch.subs[subIdx]} reported at station ${unit.UnitID}.`,
      ]);
      caseMeta.push({ unit, ch, subIdx, statusIdx, crimeDate, empID: emp.EmployeeID, courtID, arrested });
    }

    // Batch insert CaseMaster, collect returned IDs
    const cmCols = ["CrimeNo","CaseNo","CrimeRegisteredDate","PolicePersonID","PoliceStationID","CaseCategoryID","GravityOffenceID","CrimeMajorHeadID","CrimeMinorHeadID","CaseStatusID","CourtID","IncidentFromDate","IncidentToDate","InfoReceivedPSDate","latitude","longitude","BriefFacts"];
    for (let i = 0; i < caseMasterRows.length; i += BATCH) {
      const chunk = caseMasterRows.slice(i, i + BATCH);
      const { sql, params } = bulkInsert("CaseMaster", cmCols, chunk);
      const { rows } = await client.query(sql + ' RETURNING "CaseMasterID"', params);
      rows.forEach((r: { CaseMasterID: number }) => allCaseIDs.push(r.CaseMasterID));
      if ((i + BATCH) % 2000 === 0 || i + BATCH >= caseMasterRows.length) {
        process.stdout.write(`\r  CaseMaster: ${Math.min(i + BATCH, caseMasterRows.length)}/${TOTAL_CASES}`);
      }
    }
    console.log();

    // Build dependent rows using real CaseMasterIDs
    const firstAccusedByCaseID: Record<number, number> = {};

    for (let i = 0; i < allCaseIDs.length; i++) {
      const caseID = allCaseIDs[i];
      const m = caseMeta[i];

      victimRows.push([caseID, randName(), randAge(15, 75), Math.random() > 0.35 ? 1 : 2, "0"]);

      const numAccused = Math.random() < 0.3 ? 2 : 1;
      for (let a = 0; a < numAccused; a++) {
        accusedRows.push([caseID, randName(), randAge(18, 63), Math.random() > 0.15 ? 1 : 2, `A${a+1}`]);
      }

      complainantRows.push([caseID, randName(), randAge(20, 70), pick(occupIds), pick(relIds), pick(casteIds), Math.random() > 0.4 ? 1 : 2]);

      const sectionCode = m.ch.sections[m.subIdx % m.ch.sections.length];
      actSectionRows.push([caseID, m.ch.actCode, sectionCode, 1, 1]);

      if (m.arrested) {
        arrestRows.push([caseID, 1, new Date(m.crimeDate.getTime() + Math.random()*30*24*3600*1000), 1, m.unit.DistrictID, m.unit.UnitID, m.empID, m.courtID]);
      }

      if (m.statusIdx === 1) {
        csRows.push([caseID, new Date(m.crimeDate.getTime() + Math.random()*90*24*3600*1000), "A", m.empID]);
      }
    }

    console.log("  Inserting victims, accused, complainants, arrests, chargesheets...");

    await batchInsert(client, "Victim", ["CaseMasterID","VictimName","AgeYear","GenderID","VictimPolice"], victimRows, 100);
    console.log(`  Victims: ${victimRows.length}`);

    // Accused: need IDs for ArrestSurrender — batch insert with RETURNING
    const accusedColsList = ["CaseMasterID","AccusedName","AgeYear","GenderID","PersonID"];
    const allAccusedIDs: { caseID: number; accusedID: number }[] = [];
    for (let i = 0; i < accusedRows.length; i += 100) {
      const chunk = accusedRows.slice(i, i + 100);
      const { sql, params } = bulkInsert("Accused", accusedColsList, chunk);
      const { rows } = await client.query(sql + ' RETURNING "AccusedMasterID", "CaseMasterID"', params);
      rows.forEach((r: { AccusedMasterID: number; CaseMasterID: number }) => {
        if (!firstAccusedByCaseID[r.CaseMasterID]) firstAccusedByCaseID[r.CaseMasterID] = r.AccusedMasterID;
        allAccusedIDs.push({ caseID: r.CaseMasterID, accusedID: r.AccusedMasterID });
      });
    }
    console.log(`  Accused: ${accusedRows.length}`);

    await batchInsert(client, "ComplainantDetails", ["CaseMasterID","ComplainantName","AgeYear","OccupationID","ReligionID","CasteID","GenderID"], complainantRows, 100);
    console.log(`  Complainants: ${complainantRows.length}`);

    // ActSectionAssociation — ON CONFLICT DO NOTHING (duplicates possible)
    for (let i = 0; i < actSectionRows.length; i += 100) {
      const chunk = actSectionRows.slice(i, i + 100);
      const { sql, params } = bulkInsert("ActSectionAssociation", ["CaseMasterID","ActCode","SectionCode","ActOrderID","SectionOrderID"], chunk);
      await client.query(sql + " ON CONFLICT DO NOTHING", params);
    }
    console.log(`  ActSectionAssociation: ${actSectionRows.length}`);

    // ArrestSurrender — add AccusedMasterID
    const arrestRowsFull = arrestRows.map(r => {
      const caseID = r[0] as number;
      const accusedID = firstAccusedByCaseID[caseID] ?? null;
      return [...r, accusedID, true, false];
    });
    await batchInsert(client, "ArrestSurrender",
      ["CaseMasterID","ArrestSurrenderTypeID","ArrestSurrenderDate","ArrestSurrenderStateId","ArrestSurrenderDistrictId","PoliceStationID","IOID","CourtID","AccusedMasterID","IsAccused","IsComplainantAccused"],
      arrestRowsFull, 50);
    console.log(`  Arrests: ${arrestRowsFull.length}`);

    await batchInsert(client, "ChargesheetDetails", ["CaseMasterID","csdate","cstype","PolicePersonID"], csRows, 100);
    console.log(`  Chargesheets: ${csRows.length}`);

    console.log(`\nSeed complete — ${TOTAL_CASES} FIR cases in Neon.`);
    console.log(
      "Note: BriefFactsEmbedding is empty for all new rows (reseeding invalidates old vectors). " +
      "Run `npx tsx backfill-embeddings.ts` to repopulate — Gemini's free tier caps this at ~90/min, so it takes a few hours. " +
      "Not run automatically here since that would make every reseed take hours; related-case search falls back to full-text search until it's done."
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
