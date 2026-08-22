// Shifts the dates that appear inside free text (FIR narratives) by N days,
// preserving each date's original format. Used by scripts/shift-dates.ts so
// the narrative keeps agreeing with the shifted CrimeRegisteredDate.

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthIndex(name: string): number {
  const n = name.toLowerCase();
  let i = MONTHS_LONG.findIndex((m) => m.toLowerCase() === n);
  if (i < 0) i = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === n);
  if (i < 0 && n === "sept") i = 8;
  return i;
}

function addDays(y: number, m: number, d: number, days: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCMonth() !== m) return null; // e.g. 31-02
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

const pad = (n: number, width: number) => (width === 2 ? String(n).padStart(2, "0") : String(n));

export function shiftDatesInText(text: string, days: number): string {
  if (!days) return text;
  let out = text;

  // 2025-12-20
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => {
    const dt = addDays(+y, +mo - 1, +d, days);
    return dt ? `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}` : m;
  });

  // 17-04-2025, 14-3-2026, 05/03/2026 (day-month-year; separators preserved, zero padding preserved)
  out = out.replace(/\b(\d{1,2})([-/])(\d{1,2})\2(\d{4})\b/g, (m, d, sep, mo, y) => {
    const dt = addDays(+y, +mo - 1, +d, days);
    if (!dt) return m;
    return `${pad(dt.getUTCDate(), d.length)}${sep}${pad(dt.getUTCMonth() + 1, mo.length)}${sep}${dt.getUTCFullYear()}`;
  });

  // 10 Sep 2025, 27 October 2025, 1 Feb 2026
  out = out.replace(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g, (m, d, mon, y) => {
    const mi = monthIndex(mon);
    if (mi < 0) return m;
    const dt = addDays(+y, mi, +d, days);
    if (!dt) return m;
    const long = mon.length > 4 || mon.toLowerCase() === "june" || mon.toLowerCase() === "july";
    const name = long ? MONTHS_LONG[dt.getUTCMonth()] : MONTHS_SHORT[dt.getUTCMonth()];
    return `${dt.getUTCDate()} ${name} ${dt.getUTCFullYear()}`;
  });

  return out;
}
