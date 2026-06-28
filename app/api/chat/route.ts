import { NextRequest } from "next/server";
import { generateSQL, streamSummary } from "@/lib/llm";
import { DB_SCHEMA } from "@/lib/prompt-builder";
import { validateSQL, sanitizeSQL } from "@/lib/sql-validator";
import { classifyQuery } from "@/lib/query-classifier";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Remove CaseMasterID from SELECT when query uses GROUP BY — prevents 42803 error
function fixGroupByConflict(sql: string): string {
  if (!/\bGROUP\s+BY\b/i.test(sql)) return sql;
  // Strip cm."CaseMasterID", (with optional alias) from SELECT clause
  return sql.replace(/cm\."CaseMasterID"(\s+AS\s+\w+)?\s*,\s*/gi, "")
            .replace(/,\s*cm\."CaseMasterID"(\s+AS\s+\w+)?/gi, "");
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const { message, history = [] }: { message: string; history: Message[] } =
    await req.json();

  if (!message?.trim()) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  let sql = "";
  let rows: Record<string, unknown>[] = [];
  let vizType = "table";
  let sqlError: string | null = null;

  try {
    const rawSQL = await generateSQL(DB_SCHEMA, "", message, history);
    sql = sanitizeSQL(rawSQL);
    sql = fixGroupByConflict(sql);

    const validation = validateSQL(sql);
    if (!validation.valid) {
      sqlError = validation.error ?? "Invalid SQL";
    } else {
      vizType = classifyQuery(sql);
      const result = await prisma.$queryRawUnsafe(sql);
      rows = (result as Record<string, unknown>[]).map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          out[k] = typeof v === "bigint" ? Number(v) : v;
        }
        return out;
      });
    }
  } catch (e) {
    sqlError = e instanceof Error ? e.message : "Query failed";
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "meta", sql, rows, vizType, sqlError })}\n\n`
        )
      );

      if (rows.length > 0 && !sqlError) {
        try {
          for await (const token of streamSummary(message, rows)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "token", token })}\n\n`)
            );
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "token", token: `Found ${rows.length} result(s) matching your query.` })}\n\n`
            )
          );
        }
      } else if (sqlError) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", token: "Could not generate a valid query for that question. Please try rephrasing." })}\n\n`
          )
        );
      } else {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", token: "No records found matching your query." })}\n\n`
          )
        );
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
