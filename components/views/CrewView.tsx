"use client";
import { useState } from "react";
import { CrewDossier } from "../crew/CrewDossier";
import { CaseDrawer } from "../viz/CaseDrawer";
import { useChatStore } from "@/store/chat";
import { t } from "@/lib/i18n";

export function CrewView() {
  const lang = useChatStore((s) => s.lang);
  const [input, setInput] = useState("");
  const [seed, setSeed] = useState<{ caseId: number | null; personId: string | null } | null>(null);
  const [openCaseId, setOpenCaseId] = useState<number | null>(null);

  // A digits-only seed is a case id; anything else is a PersonID from the network view.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setSeed(/^\d+$/.test(v) ? { caseId: Number(v), personId: null } : { caseId: null, personId: v });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
          {t("crew.title", lang)}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {t("crew.subtitle", lang)}
        </p>
      </div>

      <div className="shrink-0 px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <form onSubmit={submit} className="flex items-center gap-2 max-w-2xl">
          <label className="text-xs shrink-0 hidden md:block" style={{ color: "var(--text-muted)" }}>
            {t("crew.seedPrompt", lang)}
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("crew.seedPlaceholder", lang)}
            className="flex-1 min-w-0 text-sm font-data px-3 py-1.5 rounded-md outline-none"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          <button
            type="submit"
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-md transition-all"
            style={{ color: "var(--red)", border: "1px solid var(--red)", background: "var(--red-dim)" }}
          >
            {t("crew.seedSubmit", lang)}
          </button>
        </form>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {!seed ? (
          <p className="font-data text-sm px-2" style={{ color: "var(--text-muted)" }}>
            {t("crew.seedIdle", lang)}
          </p>
        ) : (
          <div className="h-full max-w-5xl mx-auto">
            <CrewDossier
              key={seed.caseId ?? seed.personId}
              inline
              caseId={seed.caseId}
              personId={seed.personId}
              onClose={() => { setSeed(null); setInput(""); }}
              onOpenCase={setOpenCaseId}
            />
          </div>
        )}
      </div>

      <CaseDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
    </div>
  );
}
