/**
 * Catalyst Function: /chat
 * Env vars required:
 *   CATALYST_AUTH_TOKEN  — Zoho OAuth token (Catalyst Console → API Credentials)
 *   CATALYST_PROJECT_ID  — 46554000000013049
 *   DATABASE_URL         — PostgreSQL connection string
 */

const { Pool } = require("pg");

const QUICKML_URL = `https://api.catalyst.zoho.in/quickml/v1/project/${process.env.CATALYST_PROJECT_ID}/glm/chat`;
const GLM_MODEL = process.env.CATALYST_GLM_MODEL || "GLM-4-Flash";

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

function validateSQL(sql) {
  const cleaned = sql.replace(/--[^\n]*/g, "").trim();
  if (!cleaned) return { valid: false, error: "Empty SQL" };
  if (FORBIDDEN.test(cleaned)) return { valid: false, error: "Mutating SQL not allowed" };
  if (cleaned.replace(/;+\s*$/, "").includes(";")) return { valid: false, error: "Multiple statements not allowed" };
  if (!cleaned.toUpperCase().startsWith("SELECT")) return { valid: false, error: "Only SELECT allowed" };
  return { valid: true };
}

function sanitizeSQL(sql) { return sql.replace(/;+\s*$/, "").trim(); }

function classifyQuery(sql) {
  const upper = sql.toUpperCase();
  if (upper.includes("ACCUSED") && upper.includes("GROUP BY") && upper.includes("COUNT")) return "graph";
  if (upper.includes("LATITUDE") || upper.includes("LONGITUDE")) return "map";
  if (upper.includes("GROUP BY") && (upper.includes("DISTRICTNAME") || upper.includes("UNITNAME"))) return "map";
  if (upper.includes("GROUP BY") && (upper.includes("DATE_TRUNC") || upper.includes("MONTH") || upper.includes("DATE"))) return "chart";
  if (upper.includes("GROUP BY") && upper.includes("COUNT")) return "chart";
  return "table";
}

const DB_SCHEMA = `
CREATE TABLE "District" ("DistrictID" SERIAL PRIMARY KEY, "DistrictName" VARCHAR);
CREATE TABLE "Unit" ("UnitID" SERIAL PRIMARY KEY, "UnitName" VARCHAR, "DistrictID" INT);
CREATE TABLE "CrimeHead" ("CrimeHeadID" SERIAL PRIMARY KEY, "CrimeGroupName" VARCHAR);
CREATE TABLE "CrimeSubHead" ("CrimeSubHeadID" SERIAL PRIMARY KEY, "CrimeHeadID" INT, "CrimeHeadName" VARCHAR);
CREATE TABLE "CaseStatusMaster" ("CaseStatusID" SERIAL PRIMARY KEY, "CaseStatusName" VARCHAR);
CREATE TABLE "Employee" ("EmployeeID" SERIAL PRIMARY KEY, "FirstName" VARCHAR, "DistrictID" INT, "UnitID" INT);
CREATE TABLE "CaseMaster" ("CaseMasterID" SERIAL PRIMARY KEY, "CrimeNo" VARCHAR, "CaseNo" VARCHAR, "CrimeRegisteredDate" DATE, "PolicePersonID" INT, "PoliceStationID" INT, "CrimeMajorHeadID" INT, "CrimeMinorHeadID" INT, "CaseStatusID" INT, "latitude" DECIMAL, "longitude" DECIMAL, "BriefFacts" TEXT);
CREATE TABLE "Victim" ("VictimMasterID" SERIAL PRIMARY KEY, "CaseMasterID" INT, "VictimName" VARCHAR, "AgeYear" INT, "GenderID" INT);
CREATE TABLE "Accused" ("AccusedMasterID" SERIAL PRIMARY KEY, "CaseMasterID" INT, "AccusedName" VARCHAR, "AgeYear" INT, "GenderID" INT);
CREATE TABLE "ArrestSurrender" ("ArrestSurrenderID" SERIAL PRIMARY KEY, "CaseMasterID" INT, "ArrestSurrenderDate" DATE, "ArrestSurrenderDistrictId" INT, "PoliceStationID" INT, "IOID" INT, "AccusedMasterID" INT);
-- GenderID: 1=Male 2=Female 3=Transgender
-- CrimeGroupName: 'Crimes Against Body','Crimes Against Property','Crimes Against Women','Cybercrimes','Economic Offences','Road Accidents','Narcotics','Other IPC Crimes'
-- CaseStatusName: 'Under Investigation','Charge Sheeted','Closed','False Case'
-- Join Unit→District for district name. Join CrimeHead for crime type. Join CrimeSubHead for specific crime.
`.trim();

const SQL_SYSTEM = `You are an expert PostgreSQL query generator for the Karnataka State Police FIR database.
Rules:
- Output ONLY the SQL query. No explanation, no markdown, no backticks.
- Quote ALL column and table names with double quotes (PascalCase).
- Only SELECT queries. Never mutate data.
- Limit to 200 rows unless aggregate.
- To get district: JOIN "Unit" u ON u."UnitID"=cm."PoliceStationID" JOIN "District" d ON d."DistrictID"=u."DistrictID"
- To get crime type: JOIN "CrimeHead" ch ON ch."CrimeHeadID"=cm."CrimeMajorHeadID"
- GenderID: 1=Male 2=Female`;

module.exports = async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: "Empty message" });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let sql = "", rows = [], vizType = "table", sqlError = null;

  try {
    const historyCtx = history.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n");

    const sqlRes = await fetch(QUICKML_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${process.env.CATALYST_AUTH_TOKEN}` },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [
          { role: "system", content: `${SQL_SYSTEM}\n\n${DB_SCHEMA}` },
          { role: "user", content: `${historyCtx ? `Recent:\n${historyCtx}\n\n` : ""}Generate PostgreSQL query for: ${message}` },
        ],
      }),
    });
    const sqlJson = await sqlRes.json();
    sql = sanitizeSQL((sqlJson.choices?.[0]?.message?.content ?? "").trim());

    const validation = validateSQL(sql);
    if (!validation.valid) {
      sqlError = validation.error;
    } else {
      vizType = classifyQuery(sql);
      const result = await pool.query(sql);
      rows = result.rows;
    }
  } catch (e) {
    sqlError = e.message;
  } finally {
    await pool.end();
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: "meta", sql, rows, vizType, sqlError });

  if (rows.length > 0 && !sqlError) {
    try {
      const sumRes = await fetch(QUICKML_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${process.env.CATALYST_AUTH_TOKEN}` },
        body: JSON.stringify({
          model: GLM_MODEL, stream: true,
          messages: [
            { role: "system", content: "You are a concise Karnataka Police crime analyst. Write a 2-3 sentence plain-English summary of the results. Cite numbers." },
            { role: "user", content: `Question: ${message}\n\nData: ${JSON.stringify(rows.slice(0, 50))}` },
          ],
        }),
      });

      const reader = sumRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { send({ type: "done" }); res.end(); return; }
          try {
            const chunk = JSON.parse(data);
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) send({ type: "token", token });
          } catch {}
        }
      }
    } catch {
      send({ type: "token", token: `Found ${rows.length} result(s).` });
    }
  } else {
    send({ type: "token", token: sqlError ? "Could not generate a valid query. Please rephrase." : "No records found." });
  }

  send({ type: "done" });
  res.end();
};
