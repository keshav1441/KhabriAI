import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";
import { extractPdfText } from "@/lib/pdf-text";
import { extractFirFromDocument, MAX_DOC_CHARS, type ExtractLookups } from "@/lib/fir-extract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // the PDF reader needs node:zlib

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

// The vocabularies every extracted value has to resolve against.
async function loadLookups(): Promise<ExtractLookups> {
  const [districts, crimeHeads, categories, gravity, courts, sections] = await Promise.all([
    prisma.district.findMany({
      where: { Active: true }, orderBy: { DistrictName: "asc" },
      select: { DistrictID: true, DistrictName: true, units: { where: { Active: true }, select: { UnitID: true, UnitName: true } } },
    }),
    prisma.crimeHead.findMany({
      where: { Active: true }, orderBy: { CrimeGroupName: "asc" },
      select: { CrimeHeadID: true, CrimeGroupName: true, subHeads: { select: { CrimeSubHeadID: true, CrimeHeadName: true } } },
    }),
    prisma.caseCategory.findMany({ select: { CaseCategoryID: true, LookupValue: true } }),
    prisma.gravityOffence.findMany({ select: { GravityOffenceID: true, LookupValue: true } }),
    prisma.court.findMany({ where: { Active: true }, select: { CourtID: true, CourtName: true, DistrictID: true } }),
    prisma.section.findMany({ where: { Active: true }, select: { ActCode: true, SectionCode: true } }),
  ]);
  return { districts, crimeHeads, categories, gravity, courts, sections };
}

/** The document text: an uploaded .txt/.pdf, or text the officer pasted. */
async function readDocument(req: NextRequest): Promise<{ text: string } | { error: string; status: number }> {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return { error: "Could not read the upload", status: 400 };
    const pasted = String(fd.get("text") ?? "").trim();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return pasted ? { text: pasted } : { error: "Attach a .txt or .pdf file, or paste the text", status: 400 };
    if (file.size > MAX_FILE_BYTES) return { error: "That file is larger than 5 MB", status: 413 };

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const text = extractPdfText(buf);
      // A scan has no text layer, and this route deliberately does no OCR.
      if (text.trim().length < 40) return { error: "This PDF has no readable text layer (it looks like a scan). Open it, copy the text, and paste it below.", status: 422 };
      return { text };
    }
    if (name.endsWith(".txt") || file.type.startsWith("text/")) return { text: buf.toString("utf8") };
    return { error: "Only .txt and .pdf files can be read. Paste the text instead.", status: 415 };
  }

  const body = await req.json().catch(() => null);
  const text = typeof body === "object" && body !== null ? String((body as { text?: unknown }).text ?? "").trim() : "";
  return text ? { text } : { error: "Attach a .txt or .pdf file, or paste the text", status: 400 };
}

// Reads an FIR document into a draft of the registration form. Saves NOTHING:
// the officer reviews the draft and registers through /api/cases as before.
export async function POST(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const doc = await readDocument(req);
  if ("error" in doc) return bad(doc.error, doc.status);
  const text = doc.text.slice(0, MAX_DOC_CHARS);
  if (text.trim().length < 40) return bad("That document is too short to read as an FIR");

  try {
    const lookups = await loadLookups();
    const result = await extractFirFromDocument(text, lookups);
    const warnings = doc.text.length > MAX_DOC_CHARS
      ? [...result.warnings, `Only the first ${MAX_DOC_CHARS} characters were read`]
      : result.warnings;
    return Response.json({ ...result, warnings });
  } catch (e) {
    console.error("fir extract error:", e);
    return bad("Could not read that document", 502);
  }
}
