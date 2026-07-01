import { getGroqClient } from "./groq-client";

const GROQ_SQL_MODEL = process.env.GROQ_SQL_MODEL ?? "qwen/qwen3-32b";
const GROQ_SUMMARY_MODEL = process.env.GROQ_SUMMARY_MODEL ?? "llama-3.1-8b-instant";

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
    model: GROQ_SQL_MODEL,
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
  rows: Record<string, unknown>[]
): AsyncGenerator<string> {
  const groq = getGroqClient();
  const stream = await groq.chat.completions.create({
    model: GROQ_SUMMARY_MODEL,
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
        content: `Question: ${question}\n\nData (first 15 rows): ${JSON.stringify(rows.slice(0, 15))}`,
      },
    ],
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}
