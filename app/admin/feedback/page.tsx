"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AccuracyChart } from "@/components/admin/AccuracyChart";
import { ReviewQueue, type FeedbackItem } from "@/components/admin/ReviewQueue";
// Type-only — lib/feedback.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { FeedbackStats } from "@/lib/feedback";

/**
 * The reviewer console.
 *
 * Internal governance surface, HQ only, so it stays in English and out of the
 * investigator's navigation: the audience is the handful of people who decide
 * what the pipeline is allowed to learn.
 */

type StatusFilter = "new" | "approved" | "rejected" | "all";
type VoteFilter = "" | "up" | "down";

const STATUS_FILTERS: StatusFilter[] = ["new", "approved", "rejected", "all"];
const RANGES = [7, 30, 90];

export default function FeedbackConsolePage() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState<StatusFilter>("new");
  const [vote, setVote] = useState<VoteFilter>("");
  const [days, setDays] = useState(30);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  // 403 is the expected answer for everyone who is not a reviewer, so it gets a
  // state of its own rather than falling through to an empty console.
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(() => {
    setLoadingStats(true);
    fetch(`/api/admin/feedback/stats?days=${days}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not load the stats");
        return r.json();
      })
      .then((body) => { if (body) setStats(body.stats ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingStats(false));
  }, [days]);

  const loadList = useCallback(() => {
    setLoadingList(true);
    const qs = new URLSearchParams({ status });
    if (vote) qs.set("vote", vote);
    fetch(`/api/admin/feedback?${qs}`)
      .then(async (r) => {
        if (r.status === 403) { setDenied(true); return null; }
        if (!r.ok) throw new Error("Could not load the review queue");
        return r.json();
      })
      .then((body) => { if (body) setItems(body.items ?? []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingList(false));
  }, [status, vote]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);

  // A decision changes both the queue and every total on the strip.
  const onReviewed = useCallback(() => { loadList(); loadStats(); }, [loadList, loadStats]);

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
            Answer Review
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
            href="/admin/data-quality"
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Data quality →
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

        <StatStrip stats={stats} loading={loadingStats} />

        <Section
          title="Accuracy over time"
          note="Satisfaction against the growing bank of corrections. Days nobody rated carry no point."
        >
          {loadingStats && !stats ? (
            <div className="rounded animate-pulse" style={{ height: 280, background: "var(--bg-raised)" }} />
          ) : (
            <AccuracyChart daily={stats?.daily ?? []} />
          )}
        </Section>

        {stats && stats.weakSpots.length > 0 && (
          <Section title="Weak spots" note="Tools most often in play when an officer marked the answer wrong.">
            <WeakSpots weakSpots={stats.weakSpots} />
          </Section>
        )}

        <Section title="Review queue">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s}</Chip>
            ))}
            <span className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />
            {([["", "both votes"], ["up", "up"], ["down", "down"]] as [VoteFilter, string][]).map(([v, label]) => (
              <Chip key={label} active={vote === v} onClick={() => setVote(v)}>{label}</Chip>
            ))}
            {!loadingList && (
              <span className="font-data text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <ReviewQueue items={items} loading={loadingList} onReviewed={onReviewed} />
        </Section>
      </main>
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
          Review is an HQ function
        </h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          This console shows other officers&apos; questions, so it is limited to reviewers. Sign in with a
          reviewer account, or go back to your dashboard.
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

function StatStrip({ stats, loading }: { stats: FeedbackStats | null; loading: boolean }) {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-md animate-pulse" style={{ height: 60, background: "var(--bg-raised)" }} />
        ))}
      </div>
    );
  }

  const s = stats;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <Stat label="Rated" value={s ? s.totals.rated : "—"} />
      <Stat
        label="Satisfaction"
        value={s?.totals.satisfaction === null || !s ? "—" : `${s.totals.satisfaction}%`}
        accent={s?.totals.satisfaction != null ? (s.totals.satisfaction >= 70 ? "var(--green)" : "var(--amber)") : undefined}
      />
      <Stat label="Pending" value={s ? s.pending : "—"} accent={s && s.pending > 0 ? "var(--amber)" : undefined} />
      <Stat label="Approved" value={s ? s.approved : "—"} accent="var(--green)" />
      <Stat label="Rejected" value={s ? s.rejected : "—"} />
      <Stat label="Learned" value={s ? s.learnedExamples : "—"} accent="var(--khaki)" />
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

function WeakSpots({ weakSpots }: { weakSpots: FeedbackStats["weakSpots"] }) {
  // Ranked against the worst offender rather than the total: the useful reading
  // is which tool is furthest ahead of the rest.
  const worst = Math.max(...weakSpots.map((w) => w.down), 1);
  return (
    <div className="space-y-1.5">
      {weakSpots.map((w, i) => (
        <div key={w.tool} className="flex items-center gap-3">
          <span className="font-data text-[11px] w-4 shrink-0" style={{ color: "var(--text-muted)" }}>
            {i + 1}
          </span>
          <span className="font-data text-xs truncate" style={{ color: "var(--text-primary)", minWidth: 140 }}>
            {w.tool}
          </span>
          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(w.down / worst) * 100}%`, background: "var(--red)" }}
            />
          </span>
          <span className="font-data text-xs tabular-nums shrink-0" style={{ color: "var(--red)" }}>
            {w.down}
          </span>
        </div>
      ))}
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
