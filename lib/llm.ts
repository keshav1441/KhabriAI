// LLM: Groq (local/demo) with Catalyst QuickML fallback on deployment
// Set GROQ_API_KEY for Groq; set CATALYST_* vars for QuickML (AppSail)

import Groq from "groq-sdk";

const GROQ_MODEL = "llama-3.3-70b-versatile";

const SQL_SYSTEM_PROMPT = `You are an expert PostgreSQL query generator for the Karnataka State Police FIR (First Information Report) database.
Rules:
- Output ONLY the SQL query. No explanation, no markdown, no backticks, no comments.
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
- GenderID: 1=Male, 2=Female, 3=Transgender`;

function getGroqClient(): Groq {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

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

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 512,
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
  rows: Record<string, unknown>[]
): AsyncGenerator<string> {
  const groq = getGroqClient();
  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.3,
    max_tokens: 200,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You are a concise Karnataka Police crime analyst. Write a 2-3 sentence plain-English summary of the query results. Be factual, cite numbers. No bullet points.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nData (first 50 rows): ${JSON.stringify(rows.slice(0, 50))}`,
      },
    ],
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}
