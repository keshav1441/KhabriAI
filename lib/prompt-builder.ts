export const DB_SCHEMA = `
-- Karnataka State Police FIR Database (official KSP schema)

CREATE TABLE "State" ("StateID" SERIAL PRIMARY KEY, "StateName" VARCHAR);
CREATE TABLE "District" ("DistrictID" SERIAL PRIMARY KEY, "DistrictName" VARCHAR, "StateID" INT REFERENCES "State");
-- Common abbreviations: BLR/Bangalore/Bengaluru -> 'Bengaluru Urban' (use ILIKE '%Bengaluru%' if unsure between Urban/Rural)
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

