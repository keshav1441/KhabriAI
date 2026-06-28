export const DB_SCHEMA = `
-- Karnataka State Police FIR Database (official KSP schema)

CREATE TABLE "State" ("StateID" SERIAL PRIMARY KEY, "StateName" VARCHAR);
CREATE TABLE "District" ("DistrictID" SERIAL PRIMARY KEY, "DistrictName" VARCHAR, "StateID" INT REFERENCES "State");
CREATE TABLE "Unit" ("UnitID" SERIAL PRIMARY KEY, "UnitName" VARCHAR, "DistrictID" INT REFERENCES "District", "StateID" INT);
CREATE TABLE "Employee" ("EmployeeID" SERIAL PRIMARY KEY, "FirstName" VARCHAR, "DistrictID" INT, "UnitID" INT, "RankID" INT, "GenderID" INT);
CREATE TABLE "Rank" ("RankID" SERIAL PRIMARY KEY, "RankName" VARCHAR, "Hierarchy" INT);
CREATE TABLE "CrimeHead" ("CrimeHeadID" SERIAL PRIMARY KEY, "CrimeGroupName" VARCHAR);
-- CrimeGroupName values: 'Crimes Against Body', 'Crimes Against Property', 'Crimes Against Women', 'Cybercrimes', 'Economic Offences', 'Road Accidents', 'Narcotics', 'Other IPC Crimes'
CREATE TABLE "CrimeSubHead" ("CrimeSubHeadID" SERIAL PRIMARY KEY, "CrimeHeadID" INT REFERENCES "CrimeHead", "CrimeHeadName" VARCHAR);
-- CrimeHeadName examples: 'Murder','Theft','Rape','Robbery','Kidnapping','Online Fraud','Identity Theft','Fatal Accident'
CREATE TABLE "CaseStatusMaster" ("CaseStatusID" SERIAL PRIMARY KEY, "CaseStatusName" VARCHAR);
-- CaseStatusName values: 'Under Investigation', 'Charge Sheeted', 'Closed', 'False Case'
CREATE TABLE "CaseCategory" ("CaseCategoryID" SERIAL PRIMARY KEY, "LookupValue" VARCHAR);
-- LookupValue: 'FIR', 'UDR', 'Zero FIR', 'PAR'
CREATE TABLE "GravityOffence" ("GravityOffenceID" SERIAL PRIMARY KEY, "LookupValue" VARCHAR);
-- LookupValue: 'Heinous', 'Non-Heinous'
CREATE TABLE "Court" ("CourtID" SERIAL PRIMARY KEY, "CourtName" VARCHAR, "DistrictID" INT);
CREATE TABLE "Act" ("ActCode" VARCHAR PRIMARY KEY, "ActDescription" VARCHAR, "ShortName" VARCHAR);
-- ActCode values: 'IPC', 'IT_ACT', 'NDPS', 'MV_ACT'
CREATE TABLE "Section" ("ActCode" VARCHAR REFERENCES "Act", "SectionCode" VARCHAR, "SectionDescription" VARCHAR, PRIMARY KEY ("ActCode","SectionCode"));
-- IPC sections: 302(Murder), 307(Attempt to murder), 376(Rape), 379(Theft), 392(Robbery), 420(Cheating), 498A(Domestic Violence), 354(Assault on Women)
-- IT_ACT sections: 66C(Identity Theft), 66D(Online Fraud), 66(Computer offence)
-- NDPS sections: 20(Cannabis), 21(Manufactured drugs)
-- MV_ACT sections: 304A(Death by negligence), 279(Rash driving)

CREATE TABLE "CaseMaster" (
  "CaseMasterID" SERIAL PRIMARY KEY,
  "CrimeNo" VARCHAR,
  "CaseNo" VARCHAR,
  "CrimeRegisteredDate" DATE,
  "PolicePersonID" INT REFERENCES "Employee",
  "PoliceStationID" INT REFERENCES "Unit",
  "CaseCategoryID" INT REFERENCES "CaseCategory",
  "GravityOffenceID" INT REFERENCES "GravityOffence",
  "CrimeMajorHeadID" INT REFERENCES "CrimeHead",
  "CrimeMinorHeadID" INT REFERENCES "CrimeSubHead",
  "CaseStatusID" INT REFERENCES "CaseStatusMaster",
  "CourtID" INT REFERENCES "Court",
  "IncidentFromDate" TIMESTAMP,
  "IncidentToDate" TIMESTAMP,
  "latitude" DECIMAL,
  "longitude" DECIMAL,
  "BriefFacts" TEXT
);

CREATE TABLE "Victim" ("VictimMasterID" SERIAL PRIMARY KEY, "CaseMasterID" INT REFERENCES "CaseMaster", "VictimName" VARCHAR, "AgeYear" INT, "GenderID" INT);
-- GenderID: 1=Male, 2=Female, 3=Transgender

CREATE TABLE "Accused" ("AccusedMasterID" SERIAL PRIMARY KEY, "CaseMasterID" INT REFERENCES "CaseMaster", "AccusedName" VARCHAR, "AgeYear" INT, "GenderID" INT, "PersonID" VARCHAR);

CREATE TABLE "ComplainantDetails" ("ComplainantID" SERIAL PRIMARY KEY, "CaseMasterID" INT REFERENCES "CaseMaster", "ComplainantName" VARCHAR, "AgeYear" INT, "GenderID" INT, "OccupationID" INT, "ReligionID" INT);

CREATE TABLE "ActSectionAssociation" ("CaseMasterID" INT REFERENCES "CaseMaster", "ActCode" VARCHAR, "SectionCode" VARCHAR, "ActOrderID" INT, PRIMARY KEY ("CaseMasterID","ActCode","SectionCode"));

CREATE TABLE "ArrestSurrender" (
  "ArrestSurrenderID" SERIAL PRIMARY KEY,
  "CaseMasterID" INT REFERENCES "CaseMaster",
  "ArrestSurrenderDate" DATE,
  "ArrestSurrenderDistrictId" INT REFERENCES "District",
  "PoliceStationID" INT REFERENCES "Unit",
  "IOID" INT REFERENCES "Employee",
  "CourtID" INT REFERENCES "Court",
  "AccusedMasterID" INT REFERENCES "Accused",
  "IsAccused" BOOLEAN
);

CREATE TABLE "ChargesheetDetails" ("CSID" SERIAL PRIMARY KEY, "CaseMasterID" INT REFERENCES "CaseMaster", "csdate" TIMESTAMP, "cstype" CHAR, "PolicePersonID" INT REFERENCES "Employee");
-- cstype: A=Chargesheet, B=False Case, C=Undetected
`.trim();

const FEW_SHOT = `
-- Q: Show FIR cases registered in Bengaluru Urban district in the last 6 months
SELECT cm."CaseMasterID", cm."CrimeNo", cm."CrimeRegisteredDate", u."UnitName", ch."CrimeGroupName", csh."CrimeHeadName", cs."CaseStatusName"
FROM "CaseMaster" cm
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
WHERE d."DistrictName" = 'Bengaluru Urban'
  AND cm."CrimeRegisteredDate" >= NOW() - INTERVAL '6 months'
ORDER BY cm."CrimeRegisteredDate" DESC
LIMIT 200;

-- Q: Which districts have the most Crimes Against Property this year?
SELECT d."DistrictName", COUNT(*) AS total_cases
FROM "CaseMaster" cm
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
WHERE ch."CrimeGroupName" = 'Crimes Against Property'
  AND cm."CrimeRegisteredDate" >= DATE_TRUNC('year', NOW())
GROUP BY d."DistrictName"
ORDER BY total_cases DESC;

-- Q: Show monthly trend of cybercrime cases
SELECT DATE_TRUNC('month', cm."CrimeRegisteredDate") AS month, COUNT(*) AS cases
FROM "CaseMaster" cm
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
WHERE ch."CrimeGroupName" = 'Cybercrimes'
GROUP BY month
ORDER BY month;

-- Q: List repeat accused with more than 2 cases in the last 30 days
SELECT a."AccusedName", a."AgeYear", COUNT(DISTINCT a."CaseMasterID") AS case_count
FROM "Accused" a
JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '30 days'
GROUP BY a."AccusedName", a."AgeYear"
HAVING COUNT(DISTINCT a."CaseMasterID") > 2
ORDER BY case_count DESC
LIMIT 50;

-- Q: How many arrests were made in Mysuru district last month?
SELECT COUNT(*) AS total_arrests, d."DistrictName"
FROM "ArrestSurrender" ar
JOIN "District" d ON d."DistrictID" = ar."ArrestSurrenderDistrictId"
WHERE d."DistrictName" = 'Mysuru'
  AND ar."ArrestSurrenderDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  AND ar."ArrestSurrenderDate" < DATE_TRUNC('month', NOW())
GROUP BY d."DistrictName";

-- Q: Show cases with status Under Investigation in Belagavi
SELECT cm."CaseMasterID", cm."CrimeNo", cm."CrimeRegisteredDate", u."UnitName", ch."CrimeGroupName", csh."CrimeHeadName"
FROM "CaseMaster" cm
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
WHERE d."DistrictName" = 'Belagavi'
  AND cs."CaseStatusName" = 'Under Investigation'
ORDER BY cm."CrimeRegisteredDate" DESC
LIMIT 200;

-- Q: What are the top crime categories statewide this year?
SELECT ch."CrimeGroupName", COUNT(*) AS total_cases
FROM "CaseMaster" cm
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('year', NOW())
GROUP BY ch."CrimeGroupName"
ORDER BY total_cases DESC;

-- Q: Show female victims of crimes in the last year
SELECT cm."CaseMasterID", cm."CrimeRegisteredDate", v."VictimName", v."AgeYear", ch."CrimeGroupName", d."DistrictName"
FROM "Victim" v
JOIN "CaseMaster" cm ON cm."CaseMasterID" = v."CaseMasterID"
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
WHERE v."GenderID" = 2
  AND cm."CrimeRegisteredDate" >= NOW() - INTERVAL '12 months'
ORDER BY cm."CrimeRegisteredDate" DESC
LIMIT 200;

-- Q: Which investigating officers have the most cases this year?
SELECT e."FirstName", COUNT(cm."CaseMasterID") AS total_cases, d."DistrictName"
FROM "CaseMaster" cm
JOIN "Employee" e ON e."EmployeeID" = cm."PolicePersonID"
JOIN "District" d ON d."DistrictID" = e."DistrictID"
WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('year', NOW())
GROUP BY e."EmployeeID", e."FirstName", d."DistrictName"
ORDER BY total_cases DESC
LIMIT 20;

-- Q: Show all cases linked to accused Priya Bhat in the last 30 days
SELECT cm."CaseMasterID", cm."CrimeNo", cm."CrimeRegisteredDate", u."UnitName", d."DistrictName", ch."CrimeGroupName", csh."CrimeHeadName", cs."CaseStatusName"
FROM "Accused" a
JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
WHERE a."AccusedName" ILIKE '%Priya Bhat%'
  AND cm."CrimeRegisteredDate" >= NOW() - INTERVAL '30 days'
ORDER BY cm."CrimeRegisteredDate" DESC
LIMIT 200;

-- Q: Show theft cases with GPS coordinates in Raichur for map
SELECT cm."CaseMasterID", cm."CrimeRegisteredDate", cm."latitude", cm."longitude", u."UnitName", cs."CaseStatusName"
FROM "CaseMaster" cm
JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
JOIN "District" d ON d."DistrictID" = u."DistrictID"
JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
WHERE d."DistrictName" = 'Raichur'
  AND csh."CrimeHeadName" = 'Theft'
  AND cm."latitude" IS NOT NULL;
`.trim();

export function buildPrompt(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  const historyContext =
    history.length > 0
      ? `\n-- Recent conversation:\n${history
          .slice(-4)
          .map((m) => `-- ${m.role}: ${m.content}`)
          .join("\n")}`
      : "";

  return `${DB_SCHEMA}\n\n${FEW_SHOT}${historyContext}\n\n-- Question: ${question}\n-- SQL:`;
}
