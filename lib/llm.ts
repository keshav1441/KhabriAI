import { getLlmClient } from "./mistral-client";

const SQL_MODEL = process.env.MISTRAL_SQL_MODEL ?? "mistral-large-latest";
const SUMMARY_MODEL = process.env.MISTRAL_SUMMARY_MODEL ?? "mistral-small-latest";

const SQL_SYSTEM_PROMPT = `You are an expert PostgreSQL query generator for the Karnataka State Police FIR (First Information Report) database.
Rules:
- Output ONLY the SQL query. No explanation, no markdown, no backticks, no comments, no trailing notes about assumptions you made.
- Quote ALL column names and table names with double quotes (they are PascalCase).
- Only generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Limit results to 200 rows unless the query is an aggregate/GROUP BY.
- If the query has NO GROUP BY clause and selects individual rows from "CaseMaster", include cm."CaseMasterID" as the FIRST column.
- If the query uses GROUP BY or any aggregate function (COUNT, SUM, AVG, MAX, MIN), do NOT include cm."CaseMasterID" — it will cause a SQL error.
- Use DATE_TRUNC and INTERVAL for date filters on "CrimeRegisteredDate".
- To get district name: JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID"
- To get crime type: JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
- To get specific crime: JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
- To get status: JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
- For suspect queries: use "Accused" table joined to "CaseMaster" via "CaseMasterID"
- For victim queries: use "Victim" table joined to "CaseMaster" via "CaseMasterID"
- For arrest queries: use "ArrestSurrender" table joined to "CaseMaster" via "CaseMasterID"
- GenderID: 1=Male, 2=Female, 3=Transgender. When a result shows gender, return the label via CASE "GenderID" WHEN 1 THEN 'Male' WHEN 2 THEN 'Female' WHEN 3 THEN 'Transgender' END AS gender, not the raw ID.
- "top", "most", "highest", "which X has the most": ORDER BY the count DESC and LIMIT 10, unless the question states a number or asks for a single answer (LIMIT 1).
- Round averages and percentages to 1 decimal place: ROUND(AVG(x), 1). Do not add descriptive columns the question did not ask for.`;

export async function generateSQL(
  schema: string,
  fewShot: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  const historyContext =
    history.length > 0
      ? `\nRecent conversation:\n${history.slice(-4).map((m) => `${m.role}: ${m.content}`).join("\n")}\n`
      : "";

  const llm = getLlmClient();
  const completion = await llm.chat.completions.create({
    model: SQL_MODEL,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      { role: "system", content: `${SQL_SYSTEM_PROMPT}\n\n${schema}` },
      {
        role: "user",
        content: `${fewShot ? `Similar examples:\n${fewShot}\n\n` : ""}${historyContext}Generate a PostgreSQL query for: ${question}`,
      },
    ],
  });

  return (completion.choices[0]?.message?.content ?? "").trim();
}

export async function* streamSummary(
  question: string,
  rows: Record<string, unknown>[],
  relatedNarratives: string[] = []
): AsyncGenerator<string> {
  const llm = getLlmClient();
  const narrativeContext =
    relatedNarratives.length > 0
      ? `\n\nRelated case narratives (reference these if directly relevant): ${relatedNarratives.map((n, i) => `[${i + 1}] ${n}`).join(" ")}`
      : "";

  const stream = await llm.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0.3,
    max_tokens: 120,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You are a concise Karnataka Police crime analyst. Write 1-2 short sentences summarizing the query results. Be factual, cite numbers. No bullet points.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nData (first 15 rows): ${JSON.stringify(rows.slice(0, 15))}${narrativeContext}`,
      },
    ],
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

// One-shot repair: the model sees its own SQL plus the exact Postgres error.
export async function repairSQL(schema: string, question: string, badSQL: string, dbError: string): Promise<string> {
  const llm = getLlmClient();
  const completion = await llm.chat.completions.create({
    model: SQL_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: "system", content: `${SQL_SYSTEM_PROMPT}\n\n${schema}` },
      {
        role: "user",
        content: `The query below for "${question}" failed in PostgreSQL.\n\nSQL:\n${badSQL}\n\nError:\n${dbError}\n\nReturn the corrected SQL only.`,
      },
    ],
  });
  return (completion.choices[0]?.message?.content ?? "").trim();
}
