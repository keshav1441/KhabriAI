"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TerminalDemo, ShieldIcon } from "@/components/marketing/TerminalDemo";

const CAPABILITIES = [
  {
    title: "Ask in plain English",
    desc: "Type a question about FIRs, accused, or districts. The agent drafts the SQL, runs it, and streams the answer back — no query language required.",
  },
  {
    title: "Trace the network",
    desc: "Co-offenders linked by shared cases surface as a graph. Click a node for their full case history, age, and every associate they've worked with.",
  },
  {
    title: "See the hotspots",
    desc: "District-level crime density on an interactive map, ranked and colour-coded, one click from any pin to Google Maps.",
  },
  {
    title: "Open the case file",
    desc: "Victims, accused, arrests, chargesheet status, and act sections — pulled from eight joined tables into one dossier view.",
  },
  {
    title: "Read the pattern",
    desc: "Age, gender, occupation, and repeat-offender rates broken down by crime group, drawn straight from the case record.",
  },
];

const FLOW = [
  { step: "01", title: "Ask", desc: "Type a question about Karnataka crime data in plain English." },
  { step: "02", title: "Query", desc: "The agent drafts a SQL query against the live FIR database." },
  { step: "03", title: "Verify", desc: "Every query is parsed and rejected unless it's a single, read-only SELECT." },
  { step: "04", title: "Answer", desc: "Results stream back as narrative, table, chart, or graph — whichever fits." },
];

const STATS = [
  { label: "DB Engine", value: "PostgreSQL" },
  { label: "DB Access", value: "Read-only" },
  { label: "SQL Safety", value: "AST-validated" },
  { label: "Response", value: "Streamed" },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem("khabri_auth")) router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* ── Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-sm" style={{ background: "color-mix(in srgb, var(--bg-base) 88%, transparent)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon size={26} />
            <span className="font-display font-bold tracking-tight" style={{ fontSize: "1.1rem" }}>
              KHABRI<span style={{ color: "var(--red)" }}> AI</span>
            </span>
            <span className="badge-classified hidden sm:inline-flex">KSP Intelligence</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-md transition-all"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-md transition-all"
              style={{ background: "var(--ink)", color: "#fff" }}
            >
              Create Account
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-20 lg:pt-20 lg:pb-28">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-data font-bold tracking-widest mb-6"
                 style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)" }}>
              ● DATATHON 2026 · KSP × HACK2SKILL
            </div>
            <h1 className="font-display font-bold leading-[1.02] tracking-tight mb-5"
                style={{ fontSize: "clamp(2.25rem, 4vw, 3.25rem)", color: "var(--text-primary)" }}>
              Ask Karnataka&apos;s crime database.<br />
              <span style={{ color: "var(--red)" }}>In plain English.</span>
            </h1>
            <p className="text-base leading-relaxed max-w-md mb-8" style={{ color: "var(--text-secondary)" }}>
              Khabri AI turns an officer&apos;s question into a grounded answer — SQL, case files, network graphs, crime maps — drawn live from the KSP FIR database over a read-only line.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-10">
              <Link
                href="/login"
                className="px-5 py-3 rounded-md text-sm font-semibold tracking-wide transition-all"
                style={{ background: "var(--ink)", color: "#fff" }}
              >
                Sign In →
              </Link>
              <Link
                href="/signup"
                className="px-5 py-3 rounded-md text-sm font-semibold tracking-wide transition-all"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                Create Account
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {STATS.map((s) => (
                <div key={s.label} className="px-3.5 py-2 rounded-md text-center"
                     style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                  <p className="text-[0.65rem] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-fade-up">
            <p className="font-data text-xs tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
              Live demo ↓
            </p>
            <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--border)", height: "340px" }}>
              <TerminalDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16" style={{ borderTop: "1px solid var(--border)" }}>
        <SectionHeader title="WHAT IT DOES" />
        <div className="evidence-thread pl-6 space-y-7 max-w-2xl">
          {CAPABILITIES.map((c) => (
            <div key={c.title}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.title}</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16" style={{ borderTop: "1px solid var(--border)" }}>
        <SectionHeader title="HOW IT WORKS" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FLOW.map((f) => (
            <div key={f.step} className="rounded-lg p-4 relative overflow-hidden"
                 style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <span className="absolute bottom-1 right-3 font-display font-bold select-none pointer-events-none"
                    style={{ fontSize: "5.5rem", lineHeight: 1, color: "var(--text-primary)", opacity: 0.06 }}>
                {f.step}
              </span>
              <div className="relative z-10">
                <span className="font-data text-xs font-bold" style={{ color: "var(--red)" }}>{f.step}</span>
                <p className="font-semibold text-sm mt-1" style={{ color: "var(--text-primary)" }}>{f.title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="rounded-lg px-8 py-12 text-center relative overflow-hidden"
             style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
               style={{ opacity: 0.02 }}>
            <span className="font-display font-bold"
                  style={{ fontSize: "14vw", color: "var(--text-primary)", transform: "rotate(-8deg)", letterSpacing: "-0.05em" }}>
              KSP
            </span>
          </div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
              Ready to investigate?
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              Sign in with your officer account, or request access if you&apos;re new.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="px-5 py-3 rounded-md text-sm font-semibold tracking-wide transition-all"
                style={{ background: "var(--ink)", color: "#fff" }}
              >
                Sign In →
              </Link>
              <Link
                href="/signup"
                className="px-5 py-3 rounded-md text-sm font-semibold tracking-wide transition-all"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                Create Account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="px-6 py-8 text-center" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
          KSP × Hack2skill · Datathon 2026 · RESTRICTED SYSTEM
        </p>
      </footer>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <h2 className="font-display font-bold shrink-0 uppercase"
          style={{ fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "0.06em" }}>
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}
