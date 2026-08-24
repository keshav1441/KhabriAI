export const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  "Under Investigation": { color: "var(--amber)", bg: "var(--amber-dim)" },
  "Charge Sheeted":      { color: "var(--blue)",  bg: "rgba(59,130,246,0.12)" },
  "Closed":              { color: "var(--green)",  bg: "var(--green-dim)" },
  "False Case":          { color: "var(--red)",    bg: "var(--red-dim)" },
};

/** `ChargesheetDetails.cstype` codes → their labels. Shared so the case drawer
 *  and the handover brief cannot drift apart on what a "B" report is. */
export const CSTYPE: Record<string, string> = { A: "Chargesheet Filed", B: "False Case", C: "Undetected" };

/** No custody action in this many days reads as a stalled case, not a quiet one.
 *  Lives here rather than in `lib/custody.ts` because the desk renders it and
 *  that module reaches for the server Prisma client. */
export const STALE_ACTION_DAYS = 30;
