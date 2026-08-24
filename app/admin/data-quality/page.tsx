"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QualityCheckList } from "@/components/admin/QualityCheckList";
import { DistrictQualityTable } from "@/components/admin/DistrictQualityTable";
// Type-only — lib/data-quality.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { DataQualityReport } from "@/lib/data-quality";

/**
 * The data quality console.
 *
 * The governance counterpart to the other two: the answer review console judges
 * what the pipeline did with the records, the audit trail judges who asked —
 * this one judges the records. Every claim the app makes is downstream of them,
 * and a gap in a column is the one kind of error that never announces itself.
 *
 * English only and reviewer-gated like its siblings; the audience is HQ, not
 * the investigator.
 */

export default function DataQualityConsolePage() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  // 403 is the expected answer for everyone who is not a reviewer, so it gets a
  // state of its own rather than falling through to an empty console.
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/data-quality${refresh ? "?refresh=1" : ""}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not audit the case data");
        return r.json();
      })
      .then((body) => { if (body) setReport(body.report ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (denied) return <NotAuthorized />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <header
        className="sticky top-0 z-10 px-6 py-3 flex flex-wrap items-center gap-3"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="badge-classified">REVIEWERS ONLY</span>
          </div>
          <h1
            className="font-display font-bold uppercase tracking-tight"
            style={{ color: "var(--text-primary)", fontSize: "1.1rem" }}
          >
            Data Quality
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* The report is cached for an hour; this is the way past it once a
              correction has actually been applied to the records. */}
          <Chip active={false} onClick={() => load(true)}>{loading ? "checking…" : "recheck"}</Chip>
          <Link
            href="/dashboard"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="px-6 py-5 space-y-6" style={{ maxWidth: 1080, margin: "0 auto" }}>
        {error && !denied && (
          <p
            className="text-xs font-data px-2.5 py-2 rounded"
            style={{ color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }}
          >
            {error}
          </p>
        )}

        <ScoreStrip report={report} loading={loading} />

        <Section
          title="Checks"
          note="Ranked worst-first by severity, then by how much of the data each one touches. The line under each title is what it costs operationally."
        >
          <QualityCheckList checks={report?.checks ?? []} loading={loading && !report} />
        </Section>

        <Section
          title="By district"
          note="An FIR counts once however many case-level checks it fails — a record to go and fix, not a tally of gaps."
        >
          <DistrictQualityTable districts={report?.districts ?? []} loading={loading && !report} />
        </Section>

        {report && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {report.totalCases.toLocaleString("en-IN")} FIRs scanned ·{" "}
            {new Date(report.generatedAt).toLocaleString("en-IN", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        )}
      </main>
    </div>
  );
}

/**
 * The headline. The score is a weighted pass rate (see WEIGHTS in
 * lib/data-quality.ts), so it is deliberately harder to move than the raw
 * record count — a critical gap costs three times what a cosmetic one does.
 */
function ScoreStrip({ report, loading }: { report: DataQualityReport | null; loading: boolean }) {
  if (loading && !report) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md animate-pulse" style={{ height: 60, background: "var(--bg-raised)" }} />
        ))}
      </div>
    );
  }

  const r = report;
  const clean = r ? r.failingChecks === 0 : false;
  // Bands, not a gradient: below 95 there is something a reviewer has to act on.
  const scoreColor = !r ? undefined : r.score >= 99 ? "var(--green)" : r.score >= 95 ? "var(--amber)" : "var(--red)";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="Completeness" value={r ? `${r.score}%` : "—"} accent={scoreColor} />
      <Stat label="FIRs scanned" value={r ? r.totalCases.toLocaleString("en-IN") : "—"} />
      <Stat
        label="Checks failing"
        value={r ? `${r.failingChecks} / ${r.checks.length}` : "—"}
        accent={clean ? "var(--green)" : "var(--red)"}
      />
      <Stat
        label="Districts affected"
        value={r ? r.districts.filter((d) => d.defects > 0).length : "—"}
        accent="var(--khaki)"
      />
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg-base)" }}>
      <div
        className="w-full text-center px-6 py-8 rounded-lg"
        style={{ maxWidth: 420, background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="font-data text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--red)" }}>
          403 · Not authorized
        </div>
        <h1 className="font-display font-bold mb-2" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
          Auditing the records is an HQ function
        </h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          This console counts what is missing or contradictory across every district&apos;s FIRs, which is a
          statewide supervision view rather than a station one. Sign in with a reviewer account, or go back to
          your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-xs font-bold px-3 py-1.5 rounded-md"
          style={{ color: "var(--red)", border: "1px solid var(--red)", background: "var(--red-dim)" }}
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
      <div className="font-data text-lg font-bold leading-none tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-data" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h2>
      {note && (
        <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        {children}
      </div>
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-data text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md transition-all"
      style={{
        color: active ? "var(--red)" : "var(--text-muted)",
        background: active ? "var(--red-dim)" : "transparent",
        border: `1px solid ${active ? "var(--red)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );
}
