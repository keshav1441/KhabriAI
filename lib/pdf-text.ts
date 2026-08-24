// Minimal reader for a PDF's embedded text layer: Flate-decode the content
// streams and replay the text-showing operators.
//
// ponytail: deliberately NOT a PDF library and NOT an OCR. A scanned FIR has no
// text layer and comes back empty on purpose — the route then asks the officer to
// paste the text rather than pretending it read something.

import { inflateSync, inflateRawSync } from "node:zlib";

function inflate(chunk: Buffer): string | null {
  for (const fn of [inflateSync, inflateRawSync]) {
    try { return fn(chunk).toString("latin1"); } catch { /* not this encoding */ }
  }
  // Uncompressed content streams are stored as-is.
  return chunk.toString("latin1");
}

// Replays (string) Tj / [..] TJ, treating Td/TD/T* as line breaks.
function textFromContent(content: string): string {
  if (!/\bBT\b/.test(content) && !/\bTf\b/.test(content)) return ""; // not a text stream (image, font, metadata)
  let out = "";
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "(") {
      let depth = 1, s = "";
      for (i++; i < content.length && depth > 0; i++) {
        const c = content[i];
        if (c === "\\") {
          const n = content[++i];
          if (n === "n") s += "\n";
          else if (n === "r") s += "\r";
          else if (n === "t") s += "\t";
          else if (n >= "0" && n <= "7") {
            let oct = n;
            while (oct.length < 3 && content[i + 1] >= "0" && content[i + 1] <= "7") oct += content[++i];
            s += String.fromCharCode(parseInt(oct, 8));
          } else if (n !== "\n" && n !== "\r") s += n;
        } else if (c === "(") { depth++; s += c; }
        else if (c === ")") { if (--depth > 0) s += c; }
        else s += c;
      }
      i--;
      out += s;
    } else if (ch === "T") {
      const op = content.slice(i, i + 2);
      if (op === "Td" || op === "TD" || op === "T*") { out += "\n"; i++; }
      else if (op === "Tj" || op === "TJ") { out += " "; i++; }
    }
  }
  return out;
}

/** The document's text layer, or "" when there is none (scan, or hex-encoded subset fonts). */
export function extractPdfText(buf: Buffer): string {
  if (buf.includes("/Encrypt")) return "";
  const parts: string[] = [];
  let i = 0;
  while ((i = buf.indexOf("stream", i)) !== -1) {
    if (i >= 3 && buf.subarray(i - 3, i).toString("latin1") === "end") { i += 6; continue; }
    let s = i + 6;
    if (buf[s] === 0x0d) s++;
    if (buf[s] === 0x0a) s++;
    const end = buf.indexOf("endstream", s);
    if (end === -1) break;
    const decoded = inflate(buf.subarray(s, end));
    if (decoded) parts.push(textFromContent(decoded));
    i = end + 9;
  }
  return parts.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
