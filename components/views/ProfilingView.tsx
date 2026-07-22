"use client";
import { useEffect, useState } from "react";
import { CrimeChart } from "../viz/CrimeChart";

type Rows = Record<string, unknown>[];
interface Profiling {
  accusedAge: Rows; accusedGender: Rows; victimGender: Rows;
  occupation: Rows; religion: Rows; caste: Rows;
  offenderProfile: { crime_group: string; avg_age: number; male_pct: number; repeat_pct: number }[];
}

export function ProfilingView() {
  const [data, setData] = useState<Profiling | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profiling")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Failed to load profiling data"));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
          ಸಾಮಾಜಿಕ ವಿಶ್ಲೇಷಣೆ · SOCIO-DEMOGRAPHIC PROFILING
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Who offends, who is victimised, who reports — and the typical offender behind each crime type.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        {!error && !data && (
          <p className="font-data text-sm px-2" style={{ color: "var(--text-muted)" }}>Loading profiling…</p>
        )}
        {data && (
          <div className="grid gap-4 lg:grid-cols-2 max-w-6xl mx-auto">
            <Card title="Accused · age distribution"><CrimeChart rows={data.accusedAge} /></Card>
            <Card title="Accused · gender"><CrimeChart rows={data.accusedGender} /></Card>
            <Card title="Victims · gender"><CrimeChart rows={data.victimGender} /></Card>
            <Card title="Complainants · occupation"><CrimeChart rows={data.occupation} /></Card>
            <Card title="Complainants · religion"><CrimeChart rows={data.religion} /></Card>
            <Card title="Complainants · caste"><CrimeChart rows={data.caste} /></Card>
            <div className="lg:col-span-2">
              <Card title="Behavioural profile · typical offender by crime type">
                <OffenderTable rows={data.offenderProfile} />
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <div className="px-4 py-2 font-data text-xs font-bold uppercase tracking-wider"
           style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function OffenderTable({ rows }: { rows: Profiling["offenderProfile"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--text-muted)" }} className="font-data text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-2">Crime group</th>
            <th className="text-right px-4 py-2">Avg age</th>
            <th className="text-right px-4 py-2">% male</th>
            <th className="text-right px-4 py-2">% repeat offender</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.crime_group} style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <td className="px-4 py-2">{r.crime_group}</td>
              <td className="px-4 py-2 text-right font-data">{r.avg_age}</td>
              <td className="px-4 py-2 text-right font-data">{r.male_pct}%</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: r.repeat_pct >= 50 ? "var(--red)" : "var(--text-primary)" }}>
                {r.repeat_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
