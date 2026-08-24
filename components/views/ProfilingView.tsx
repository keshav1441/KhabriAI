"use client";
import { useEffect, useState } from "react";
import { CrimeChart } from "../viz/CrimeChart";
import { useChatStore } from "@/store/chat";
import { t } from "@/lib/i18n";

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
            <div className="lg:col-span-2">
              <IdentityPanel />
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

/**
 * Every number on this page is grouped by `Accused.PersonID` — the "% repeat
 * offender" column above is literally a count of it. Real KSP data has no such
 * column, so this panel is the same question asked the way production would
 * have to ask it: which other records describe this human, judged on the name,
 * age and gender the register actually holds. Nothing is merged; the officer is
 * shown the candidates and the reasons, and decides.
 */
function IdentityPanel() {
  const lang = useChatStore((s) => s.lang);
  const [input, setInput] = useState("");
  const [state, setState] = useState<{ loading: boolean; error: string; data: IdentityResponse | null }>({
    loading: false, error: "", data: null,
  });

  // A digits-only seed is an AccusedMasterID; anything else is a PersonID, the
  // handle the network and crew views already pass around.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    const q = /^\d+$/.test(v) ? `accusedId=${v}` : `personId=${encodeURIComponent(v)}`;
    setState({ loading: true, error: "", data: null });
    fetch(`/api/identity?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: IdentityResponse) => setState({ loading: false, error: "", data }))
      .catch(() => setState({ loading: false, error: "Failed to resolve identity", data: null }));
  };

  const d = state.data;
  return (
    <Card title={t("identity.title", lang)}>
      <div className="px-4 py-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("identity.hint", lang)}</p>
        <form onSubmit={submit} className="flex items-center gap-2 mt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Accused record id, or a PersonID"
            className="flex-1 min-w-0 text-sm font-data px-3 py-1.5 rounded-md outline-none"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="submit"
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--red)", border: "1px solid var(--red)", background: "var(--red-dim)" }}
          >
            MATCH
          </button>
        </form>

        {state.error && <p className="text-sm mt-3" style={{ color: "var(--red)" }}>{state.error}</p>}
        {state.loading && (
          <p className="font-data text-sm mt-3" style={{ color: "var(--text-muted)" }}>{t("identity.checking", lang)}</p>
        )}

        {d && (
          <div className="mt-4">
            <div className="font-data text-xs" style={{ color: "var(--text-secondary)" }}>
              {d.seed.name ?? "—"} · {d.seed.age ?? "?"} · FIR {d.seed.crimeNo ?? d.seed.caseId}
              {d.seed.district ? ` · ${d.seed.district}` : ""}
            </div>
            {!d.candidates.length ? (
              <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>{t("identity.none", lang)}</p>
            ) : (
              <>
                <div className="font-data text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {d.candidates.length + 1} {t("identity.cases", lang)} · {d.considered} record(s) checked
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {d.candidates.map((c) => (
                    <li key={c.accusedId} className="rounded-md px-3 py-2"
                        style={{ border: "1px solid var(--border)", background: "var(--bg-raised)" }}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {c.name ?? "—"} · {c.age ?? "?"}
                          <span className="font-data text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                            FIR {c.crimeNo ?? c.caseId}{c.district ? ` · ${c.district}` : ""}{c.registered ? ` · ${c.registered}` : ""}
                          </span>
                        </span>
                        <span className="font-data text-xs font-bold shrink-0" style={{ color: "var(--red)" }}>
                          {t("identity.confidence", lang)} {Math.round(c.confidence * 100)}%
                        </span>
                      </div>
                      <div className="font-data text-[0.65rem] uppercase tracking-wider mt-2"
                           style={{ color: "var(--text-muted)" }}>
                        {t("identity.why", lang)}
                      </div>
                      <ul className="mt-1">
                        {c.reasons.map((r) => (
                          <li key={r.signal} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            <span className="font-data" style={{ color: "var(--text-muted)" }}>{r.weight.toFixed(2)}</span>{" "}
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

interface IdentityRecord {
  accusedId: number; caseId: number; crimeNo: string | null; name: string | null;
  age: number | null; district: string | null; registered: string | null;
}
interface IdentityResponse {
  seed: IdentityRecord;
  candidates: (IdentityRecord & {
    confidence: number;
    reasons: { signal: string; weight: number; label: string }[];
  })[];
  considered: number;
}
