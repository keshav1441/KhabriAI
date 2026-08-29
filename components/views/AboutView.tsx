"use client";
import { useChatStore } from "@/store/chat";
import { t, tk, type StringKey } from "@/lib/i18n";

// `name` is a product name and is never translated. `desc` goes through tk():
// a key where the line is prose, a literal where it is a list of product names.
const TECH_STACK = [
  {
    category: "about.tech.frontend" as StringKey,
    color: "var(--blue)",
    bg: "var(--blue-dim)",
    items: [
      { name: "Next.js 16", desc: "App Router · Turbopack · SSR + RSC" },
      { name: "React 19", desc: "Client components · Hooks · Zustand store" },
      { name: "Tailwind CSS v4", desc: "CSS variables · Custom variants" },
      { name: "Space Grotesk", desc: "Variable font · Space Mono for data" },
    ],
  },
  {
    category: "about.tech.agentic" as StringKey,
    color: "var(--red)",
    bg: "var(--red-dim)",
    items: [
      { name: "Mistral AI", desc: "mistral-large orchestrator + SQL · mistral-small narrator" },
      { name: "Tool-Calling Orchestrator", desc: "about.tech.orchestrator" },
      { name: "9 Investigation Tools", desc: "about.tech.tools" },
      { name: "RAG Retrieval", desc: "about.tech.rag" },
      { name: "Catalyst QuickML", desc: "about.tech.quickml" },
      { name: "SSE Streaming", desc: "about.tech.sse" },
    ],
  },
  {
    category: "about.tech.data" as StringKey,
    color: "var(--green)",
    bg: "var(--green-dim)",
    items: [
      { name: "Neon PostgreSQL", desc: "Serverless · Connection pooling · PgBouncer" },
      { name: "Prisma v7", desc: "Driver adapter · Raw SQL · Type-safe ORM" },
      { name: "KSP Crime DB", desc: "about.tech.kspdb" },
      { name: "Zoho Catalyst", desc: "about.tech.catalyst" },
      { name: "Signed Session Auth", desc: "HMAC-SHA256 cookie · PBKDF2-SHA512 password hashing" },
    ],
  },
  {
    category: "about.tech.visualisation" as StringKey,
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    items: [
      { name: "Recharts", desc: "about.tech.recharts" },
      { name: "Leaflet + OSM", desc: "about.tech.leaflet" },
      { name: "Cytoscape.js", desc: "about.tech.cytoscape" },
      { name: "Custom Drawer", desc: "about.tech.drawer" },
    ],
  },
];

const FEATURES: { color: string; bg: string; title: StringKey; desc: StringKey }[] = [
  { color: "var(--red)",   bg: "var(--red-dim)",   title: "about.feature.copilot.title",     desc: "about.feature.copilot.desc" },
  { color: "var(--amber)", bg: "var(--amber-dim)", title: "about.feature.board.title",       desc: "about.feature.board.desc" },
  { color: "var(--blue)",  bg: "var(--blue-dim)",  title: "about.feature.stream.title",      desc: "about.feature.stream.desc" },
  { color: "var(--green)", bg: "var(--green-dim)", title: "about.feature.briefing.title",    desc: "about.feature.briefing.desc" },
  { color: "var(--amber)", bg: "var(--amber-dim)", title: "about.feature.viz.title",         desc: "about.feature.viz.desc" },
  { color: "var(--red)",   bg: "var(--red-dim)",   title: "about.feature.casefile.title",    desc: "about.feature.casefile.desc" },
  { color: "var(--blue)",  bg: "var(--blue-dim)",  title: "about.feature.responsible.title", desc: "about.feature.responsible.desc" },
];

const FLOW: { step: string; title: StringKey; desc: StringKey }[] = [
  { step: "01", title: "about.flow.1.title", desc: "about.flow.1.desc" },
  { step: "02", title: "about.flow.2.title", desc: "about.flow.2.desc" },
  { step: "03", title: "about.flow.3.title", desc: "about.flow.3.desc" },
  { step: "04", title: "about.flow.4.title", desc: "about.flow.4.desc" },
];

export function AboutView() {
  const lang = useChatStore((s) => s.lang);
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* Hero */}
        <div className="text-center space-y-4 py-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-data font-bold tracking-widest"
               style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)" }}>
            ● DATATHON 2026 · KSP × HACK2SKILL
          </div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Khabri<span style={{ color: "var(--red)" }}> AI</span>
          </h1>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            {t("about.tagline", lang)}
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {([
              { label: "about.stat.llm", value: "Mistral AI" },
              { label: "about.stat.db", value: "Neon PostgreSQL" },
              { label: "about.stat.latency", value: t("about.stat.latencyValue", lang) },
              { label: "about.stat.access", value: t("about.stat.accessValue", lang) },
            ] as const).map((s) => (
              <div key={s.label} className="px-4 py-2 rounded-md text-center"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <p className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t(s.label, lang)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section>
          <SectionHeader title={t("about.section.how", lang)} />
          <div className="grid sm:grid-cols-4 gap-3">
            {FLOW.map((f) => (
              <div key={f.step} className="rounded-lg p-4 relative overflow-hidden"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                {/* Large structural number */}
                <span className="absolute bottom-1 right-3 font-display font-bold select-none pointer-events-none"
                      style={{ fontSize: "5.5rem", lineHeight: 1, color: "var(--text-primary)", opacity: 0.06 }}>
                  {f.step}
                </span>
                <div className="relative z-10">
                  <span className="font-data text-xs font-bold" style={{ color: "var(--red)" }}>{f.step}</span>
                  <p className="font-semibold text-sm mt-1" style={{ color: "var(--text-primary)" }}>{t(f.title, lang)}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t(f.desc, lang)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section>
          <SectionHeader title={t("about.section.features", lang)} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="rounded-lg p-4 transition-all"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                   onMouseEnter={(e) => (e.currentTarget.style.borderColor = f.color)}
                   onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 font-display"
                        style={{ background: f.bg, color: f.color }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t(f.title, lang)}</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t(f.desc, lang)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <SectionHeader title={t("about.section.tech", lang)} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TECH_STACK.map((cat) => (
              <div key={cat.category} className="rounded-lg overflow-hidden"
                   style={{ border: "1px solid var(--border)" }}>
                <div className="px-4 py-2.5" style={{ background: cat.bg, borderBottom: `1px solid ${cat.color}` }}>
                  <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: cat.color }}>
                    {t(cat.category, lang)}
                  </p>
                </div>
                <div className="divide-y" style={{ background: "var(--bg-surface)" }}>
                  {cat.items.map((item) => (
                    <div key={item.name} className="px-4 py-3">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{tk(item.desc, lang)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Responsible AI */}
        <section>
          <div className="rounded-lg p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-start gap-4">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 font-bold"
                    style={{ background: "var(--green-dim)", color: "var(--green)" }}>
                ⚖
              </span>
              <div>
                <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{t("about.responsible.title", lang)}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {t("about.responsible.body", lang)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
            {t("about.footer", lang)}
          </p>
        </div>

      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <h2 className="font-display font-bold shrink-0 uppercase"
          style={{ fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "0.06em" }}>
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}
