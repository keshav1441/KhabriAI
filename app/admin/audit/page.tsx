"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuditRunList, ScopeBadge, fmtMs, type AuditRunRow } from "@/components/admin/AuditRunList";
import { ToolLatencyTable } from "@/components/admin/ToolLatencyTable";
// Type-only — lib/audit.ts reaches for the server Prisma client, so this import
// must never survive into the browser bundle.
import type { AuditSummary } from "@/lib/audit";

/**
 * The audit viewer.
 *
 * Sibling of the answer-review console and gated the same way: these rows carry
 * other officers' questions, which can name real people. The unit is the run —
 * one question — because that is what a reviewer is accountable for, not the
 * individual tool call.
 */

type StatusFilter = "" | "ok" | "error";

const RANGES = [7, 30, 90];
// The API takes the literal "statewide" for an unscoped query; the summary
// reports it as the display name "Statewide". Translate at the boundary.
const STATEWIDE = "Statewide";

export default function AuditConsolePage() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [runs, setRuns] = useState<AuditRunRow[]>([]);
  const [days, setDays] = useState(30);
  const [officer, setOfficer] = useState("");
  const [tool, setTool] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [q, setQ] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  // 403 is the expected answer for everyone who is not a reviewer, so it gets a
  // state of its own rather than falling through to an empty console.
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  // Typing an officer or a phrase should not fire a query per keystroke.
  const debouncedOfficer = useDebounced(officer, 350);
  const debouncedQ = useDebounced(q, 350);

  const loadSummary = useCallback(() => {
    setLoadingSummary(true);
    fetch(`/api/admin/audit/summary?days=${days}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not load the audit summary");
        return r.json();
      })
      .then((body) => { if (body) setSummary(body.summary ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingSummary(false));
  }, [days]);

  const loadRuns = useCallback(() => {
    setLoadingRuns(true);
    const qs = new URLSearchParams({ days: String(days), limit: "50" });
    if (debouncedOfficer) qs.set("officer", debouncedOfficer);
    if (tool) qs.set("tool", tool);
    if (scope) qs.set("scope", scope === STATEWIDE ? "statewide" : scope);
    if (status) qs.set("status", status);
    if (debouncedQ) qs.set("q", debouncedQ);
    fetch(`/api/admin/audit?${qs}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not load the audit trail");
        return r.json();
      })
      .then((body) => { if (body) setRuns(body.runs ?? []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingRuns(false));
  }, [days, debouncedOfficer, tool, scope, status, debouncedQ]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const filtered = useMemo(
    () => Boolean(debouncedOfficer || tool || scope || status || debouncedQ),
    [debouncedOfficer, tool, scope, status, debouncedQ]
  );

  const clearFilters = () => {
    setOfficer(""); setTool(""); setScope(""); setStatus(""); setQ("");
  };

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
            Audit Trail
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            {RANGES.map((d) => (
              <Chip key={d} active={days === d} onClick={() => setDays(d)}>{`${d}d`}</Chip>
            ))}
          </div>
          <Link
            href="/admin/feedback"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Answer review →
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
        {error && !denied && (
          <p
            className="text-xs font-data px-2.5 py-2 rounded"
            style={{ color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }}
          >
            {error}
          </p>
        )}

        <StatStrip summary={summary} loading={loadingSummary} />

        <Section
          title="Tool health"
          note="Median latency and failures per tool over the window — the operational read on the pipeline."
        >
          {loadingSummary && !summary ? (
            <div className="rounded animate-pulse" style={{ height: 140, background: "var(--bg-raised)" }} />
          ) : (
            <ToolLatencyTable byTool={summary?.byTool ?? []} />
          )}
        </Section>

        <Section
          title="Runs"
          note="One row per question an officer asked. The scope is what they were allowed to see when they asked it."
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <TextInput value={officer} onChange={setOfficer} placeholder="officer email" width={170} />
            <TextInput value={q} onChange={setQ} placeholder="search the question" width={200} />
            <Select value={tool} onChange={setTool} placeholder="any tool">
              {(summary?.byTool ?? []).map((t) => (
                <option key={t.tool} value={t.tool}>{t.tool}</option>
              ))}
            </Select>
            <Select value={scope} onChange={setScope} placeholder="any scope">
              {(summary?.scopes ?? []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            <span className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />
            {([["", "any status"], ["ok", "ok"], ["error", "error"]] as [StatusFilter, string][]).map(([v, label]) => (
              <Chip key={label} active={status === v} onClick={() => setStatus(v)}>{label}</Chip>
            ))}
            {filtered && <Chip active={false} onClick={clearFilters}>clear</Chip>}
            {!loadingRuns && (
              <span className="font-data text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                {runs.length} run{runs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <AuditRunList runs={runs} loading={loadingRuns} />
        </Section>

        {summary && summary.byOfficer.length > 0 && (
          <Section title="Who is asking" note="Runs per officer, with the scope their questions ran under.">
            <div className="space-y-1.5">
              {summary.byOfficer.map((o) => (
                <div key={o.officer} className="flex items-center gap-3">
                  <span className="text-xs truncate" style={{ color: "var(--text-primary)", minWidth: 180 }}>
                    {o.officer}
                  </span>
                  <ScopeBadge scope={o.scope} />
                  <span className="font-data text-xs tabular-nums ml-auto" style={{ color: "var(--text-secondary)" }}>
                    {o.runs}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}

/** Keeps a free-text filter from firing a request on every keystroke. */
function useDebounced<T>(value: T, ms: number) {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setHeld(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return held;
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
          The trail is an HQ function
        </h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          This console shows every question other officers asked and what the pipeline did with it, so it is
          limited to reviewers. Sign in with a reviewer account, or go back to your dashboard.
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

function StatStrip({ summary, loading }: { summary: AuditSummary | null; loading: boolean }) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-md animate-pulse" style={{ height: 60, background: "var(--bg-raised)" }} />
        ))}
      </div>
    );
  }

  const s = summary;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <Stat label="Runs" value={s ? s.runs : "—"} />
      <Stat label="Tool calls" value={s ? s.toolCalls : "—"} />
      <Stat
        label="Failures"
        value={s ? s.failures : "—"}
        accent={s && s.failures > 0 ? "var(--red)" : undefined}
      />
      <Stat label="Officers" value={s ? s.officers : "—"} accent="var(--khaki)" />
      <Stat label="Median run" value={s ? fmtMs(s.medianRunMs) : "—"} />
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

function TextInput({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width: number;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className="font-data text-[11px] rounded-md px-2.5 py-1 outline-none"
      style={{
        width,
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--khaki)"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    />
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="font-data text-[11px] rounded-md px-2 py-1 outline-none"
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        color: value ? "var(--text-primary)" : "var(--text-muted)",
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
