"use client";
import { useState, useEffect } from "react";

const DEMO_QUERY = "Show unsolved homicides in Bengaluru Urban, last 90 days";
const DEMO_SQL = `SELECT c.case_number, c.crime_type,
  c.station_name, c.date_of_occurrence
FROM cases c
WHERE c.district = 'Bengaluru Urban'
  AND c.crime_type ILIKE '%murder%'
  AND c.chargesheet_filed = false
  AND c.date_of_occurrence
      >= NOW() - INTERVAL '90 days'
ORDER BY c.date_of_occurrence DESC;`;
const DEMO_ROWS = [
  ["BLR/2024/2847", "Shivajinagar", "14 Dec 2024"],
  ["BLR/2024/2901", "Cubbon Park",  "08 Dec 2024"],
  ["BLR/2024/3012", "Indiranagar",  "29 Nov 2024"],
];

type Phase = "typing" | "generating" | "sql" | "results" | "pause";

export function TerminalDemo() {
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed < DEMO_QUERY.length) {
        t = setTimeout(() => setTyped((n) => n + 1), 38);
      } else {
        t = setTimeout(() => setPhase("generating"), 700);
      }
    } else if (phase === "generating") {
      t = setTimeout(() => setPhase("sql"), 1200);
    } else if (phase === "sql") {
      t = setTimeout(() => setPhase("results"), 900);
    } else if (phase === "results") {
      t = setTimeout(() => setPhase("pause"), 3500);
    } else {
      t = setTimeout(() => { setTyped(0); setPhase("typing"); }, 1500);
    }
    return () => clearTimeout(t);
  }, [phase, typed]);

  return (
    <div className="h-full overflow-hidden text-xs"
         style={{ background: "var(--bg-base)" }}>
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2"
           style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FF5F56" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FFBD2E" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#27C93F" }} />
        <span className="ml-2 font-data" style={{ color: "var(--text-muted)" }}>khabri — intel terminal</span>
      </div>
      {/* Body */}
      <div className="p-4 font-data space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100% - 36px)" }}>
        {/* Prompt line */}
        <div>
          <span style={{ color: "var(--khaki)" }}>ksp@intel</span>
          <span style={{ color: "var(--text-muted)" }}>:~$ </span>
          <span style={{ color: "var(--text-primary)" }}>{DEMO_QUERY.slice(0, typed)}</span>
          {phase === "typing" && <span className="cursor-blink" />}
        </div>
        {/* Generating state */}
        {phase === "generating" && (
          <div style={{ color: "var(--amber)" }}>
            ⟳ Generating SQL...
          </div>
        )}
        {/* SQL block */}
        {(phase === "sql" || phase === "results") && (
          <pre className="text-xs leading-relaxed overflow-hidden"
               style={{ color: "var(--green)" }}>
            {DEMO_SQL}
          </pre>
        )}
        {/* Results */}
        {phase === "results" && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <div className="mb-1.5" style={{ color: "var(--text-muted)" }}>→ 3 results · 74ms</div>
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left font-normal pb-1 pr-4">CASE NO.</th>
                  <th className="text-left font-normal pb-1 pr-4">STATION</th>
                  <th className="text-left font-normal pb-1">DATE</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map(([no, station, date]) => (
                  <tr key={no}>
                    <td className="py-0.5 pr-4" style={{ color: "var(--red)" }}>{no}</td>
                    <td className="py-0.5 pr-4" style={{ color: "var(--text-primary)" }}>{station}</td>
                    <td className="py-0.5" style={{ color: "var(--text-muted)" }}>{date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function ShieldIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.125} viewBox="0 0 32 36" fill="none">
      <path
        d="M16 1L2 7v10c0 8.5 5.9 16.5 14 18.5C24.1 33.5 30 25.5 30 17V7L16 1z"
        fill="var(--red)"
        fillOpacity="0.15"
        stroke="var(--red)"
        strokeWidth="1.5"
      />
      <path
        d="M11 18l3 3 7-7"
        stroke="var(--red)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
