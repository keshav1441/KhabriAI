"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MisuseFindingList, OfficerRanking } from "@/components/admin/MisuseFindingList";
// Type-only — lib/misuse.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { MisuseReport } from "@/lib/misuse";

/**
 * The oversight console.
 *
 * Sibling of the audit trail and gated identically. The trail answers "what was
 * asked"; this page answers the question the trail exists for — "is anyone
 * using this tool on people it was not given to them for". It reads only
 * querying behaviour, and it produces questions for a human, never decisions.
 */

const RANGES = [7, 30, 90];

export default function MisuseConsolePage() {
  const [report, setReport] = useState<MisuseReport | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  // 403 is the expected answer for everyone who is not a reviewer, so it gets a
  // state of its own rather than falling through to an empty console.
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/misuse?days=${days}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not run the misuse checks");
        return r.json();
      })
      .then((body) => { if (body) setReport(body.report ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (denied) return <NotAuthorized />;

  const elevated = report?.findings.filter((f) => f.severity === "elevated").length ?? 0;

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
            Misuse Watch
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            {RANGES.map((d) => (
              <Chip key={d} active={days === d} onClick={() => setDays(d)}>{`${d}d`}</Chip>
            ))}
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Audit trail →
          </Link>
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
        {error && (
          <p
            className="text-xs font-data px-2.5 py-2 rounded"
            style={{ color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }}
          >
            {error}
          </p>
        )}

        {/* The framing is load-bearing, not decoration. Anyone reading a page
            that ranks named officers has to be told, before they read a name,
            what the ranking is and is not. */}
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--khaki)" }}
        >
          <div
            className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: "var(--khaki)" }}
          >
            How to read this page
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            These are patterns in <strong>how the tool was queried</strong> — nothing here measures an officer&apos;s
            work, output, or effectiveness. Every signal has an ordinary explanation that is more likely than the
            worrying one, printed on the card next to it. A finding is a prompt for a reviewer to look and for the
            officer to explain; it is not a finding of wrongdoing, and nothing on this page restricts anybody&apos;s
            access.
          </p>
        </div>

        <StatStrip report={report} loading={loading} elevated={elevated} />

        <Section
          title="Findings"
          note="Ranked by how strongly the pattern stands out, newest first within each band. Expand a card for the questions behind it."
        >
          <MisuseFindingList
            findings={report?.findings ?? []}
            loading={loading}
            runsExamined={report?.runsExamined ?? 0}
          />
        </Section>

        {report && report.byOfficer.length > 0 && (
          <Section
            title="Where to start"
            note="A review queue order, built only from the signals that fired. An officer with no signals does not appear at all."
          >
            <OfficerRanking rows={report.byOfficer} />
          </Section>
        )}

        {report && (
          <Section
            title="What these checks cannot see"
            note="A control whose blind spots are undocumented is worse than no control. These are the misuse routes this trail does not record."
          >
            <ul className="space-y-1.5">
              {report.notCovered.map((gap) => (
                <li key={gap} className="text-xs flex gap-2" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-muted)" }}>—</span>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </main>
    </div>
  );
}

function StatStrip({
  report,
  loading,
  elevated,
}: {
  report: MisuseReport | null;
  loading: boolean;
  elevated: number;
}) {
  if (loading && !report) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md animate-pulse" style={{ height: 60, background: "var(--bg-raised)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="Runs checked" value={report ? report.runsExamined : "—"} />
      <Stat label="Officers seen" value={report ? report.officers : "—"} />
      <Stat
        label="Findings"
        value={report ? report.findings.length : "—"}
        accent={report && report.findings.length > 0 ? "var(--khaki)" : "var(--green)"}
      />
      <Stat label="Look first" value={report ? elevated : "—"} accent={elevated > 0 ? "var(--red)" : "var(--green)"} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
      <div
        className="font-data text-lg font-bold leading-none tabular-nums"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
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
      <div className="rounded-lg p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
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
          Oversight is an HQ function
        </h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          This console names officers and the people their queries searched for, so it is limited to reviewers. Sign
          in with a reviewer account, or go back to your dashboard.
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
