"use client";

const TECH_STACK = [
  {
    category: "Frontend",
    color: "var(--blue)",
    bg: "var(--blue-dim)",
    items: [
      { name: "Next.js 15", desc: "App Router · Turbopack · SSR + RSC" },
      { name: "React 19", desc: "Client components · Hooks · Context" },
      { name: "Tailwind CSS v4", desc: "CSS variables · Custom variants" },
      { name: "Space Grotesk", desc: "Variable font · Space Mono for data" },
    ],
  },
  {
    category: "AI & Intelligence",
    color: "var(--red)",
    bg: "var(--red-dim)",
    items: [
      { name: "Groq LPU", desc: "llama-3.3-70b-versatile · Sub-second SQL" },
      { name: "Text-to-SQL", desc: "Schema-in-prompt · Few-shot examples" },
      { name: "SSE Streaming", desc: "Token-by-token AI narrative delivery" },
      { name: "NL Summaries", desc: "Contextual explanation of query results" },
    ],
  },
  {
    category: "Data & Backend",
    color: "var(--green)",
    bg: "var(--green-dim)",
    items: [
      { name: "Neon PostgreSQL", desc: "Serverless · Connection pooling · PgBouncer" },
      { name: "Prisma v7", desc: "Driver adapter · Raw SQL · Type-safe ORM" },
      { name: "KSP Crime DB", desc: "Real Karnataka Police data schema" },
      { name: "Node.js Crypto", desc: "PBKDF2-SHA512 · 100k iterations · Custom auth" },
    ],
  },
  {
    category: "Visualisation",
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    items: [
      { name: "Recharts", desc: "Bar · Pie · Line charts — auto-selected" },
      { name: "Leaflet + OSM", desc: "Crime heatmap · Google Maps deep-links" },
      { name: "Cytoscape.js", desc: "Criminal network graph · cose-bilkent layout" },
      { name: "Custom Drawer", desc: "Full case file modal with all linked data" },
    ],
  },
];

const FEATURES = [
  {
    icon: "◈",
    color: "var(--red)",
    bg: "var(--red-dim)",
    title: "Natural Language → SQL",
    desc: "Ask questions in plain English. Groq LLM generates parameterised SQL, validates it read-only, executes it on the live KSP database.",
  },
  {
    icon: "⚡",
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    title: "Streaming Intelligence",
    desc: "AI narrative streams token-by-token via Server-Sent Events. Results appear as the model thinks — no waiting for full response.",
  },
  {
    icon: "◉",
    color: "var(--blue)",
    bg: "var(--blue-dim)",
    title: "Proactive Briefings",
    desc: "On every load, three background queries detect crime spikes, repeat accuseds, and weekly surges — surfaced automatically.",
  },
  {
    icon: "▦",
    color: "var(--green)",
    bg: "var(--green-dim)",
    title: "Smart Visualisation",
    desc: "Query classifier auto-selects bar, pie, or line chart. District queries open on OpenStreetMap with Google Maps deep-links.",
  },
  {
    icon: "⬡",
    color: "var(--red)",
    bg: "var(--red-dim)",
    title: "Full Case File Modal",
    desc: "Every case row opens a rich modal: accused, victims, arrests, chargesheet, act sections, court — sourced from 8 joined tables.",
  },
  {
    icon: "◎",
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    title: "Responsible AI",
    desc: "Read-only database role. Every AI response shows the generated SQL. Runtime GROUP BY safety net strips invalid aggregates.",
  },
];

const FLOW = [
  { step: "01", title: "You ask", desc: "Type or speak a question in plain English about Karnataka crime data" },
  { step: "02", title: "Groq generates SQL", desc: "llama-3.3-70b converts your question to safe, parameterised PostgreSQL using schema-in-prompt" },
  { step: "03", title: "Neon executes", desc: "Query runs on the live KSP database via Prisma with a read-only connection" },
  { step: "04", title: "AI explains", desc: "Groq streams a narrative summary of the results, token by token, with auto-selected chart" },
];

export function AboutView() {
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
            Conversational crime intelligence for Karnataka Police — ask questions in plain English, get SQL-powered insights, streamed in real time.
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {[
              { label: "LLM Inference", value: "Groq LPU" },
              { label: "DB Engine", value: "Neon PostgreSQL" },
              { label: "Response time", value: "< 2s avg" },
              { label: "DB Access", value: "Read-only" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-2 rounded-md text-center"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <p className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section>
          <SectionHeader title="HOW IT WORKS" />
          <div className="grid sm:grid-cols-4 gap-3">
            {FLOW.map((f) => (
              <div key={f.step} className="rounded-lg p-4 relative"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <span className="font-data text-3xl font-bold block mb-2" style={{ color: "var(--red-dim)", lineHeight: 1 }}>
                  {f.step}
                </span>
                <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{f.title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section>
          <SectionHeader title="KEY FEATURES" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg p-4 transition-all group"
                   style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                   onMouseEnter={(e) => (e.currentTarget.style.borderColor = f.color)}
                   onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: f.bg, color: f.color }}>
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{f.title}</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <SectionHeader title="TECH STACK" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TECH_STACK.map((cat) => (
              <div key={cat.category} className="rounded-lg overflow-hidden"
                   style={{ border: "1px solid var(--border)" }}>
                <div className="px-4 py-2.5" style={{ background: cat.bg, borderBottom: `1px solid ${cat.color}` }}>
                  <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: cat.color }}>
                    {cat.category}
                  </p>
                </div>
                <div className="divide-y" style={{ background: "var(--bg-surface)" }}>
                  {cat.items.map((item) => (
                    <div key={item.name} className="px-4 py-3">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
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
                <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Responsible AI Design</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Khabri AI operates on a <strong>read-only database role</strong> — no query can modify, insert, or delete data.
                  Every AI response shows the exact SQL generated, giving investigators full transparency into the source of insights.
                  A runtime sanitiser strips invalid GROUP BY clauses before execution, preventing SQL errors from reaching the database.
                  Auth uses PBKDF2-SHA512 (100k iterations) stored in Neon — no third-party auth services.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
            Built for Datathon 2026 · KSP × Hack2Skill Challenge 1 · Karnataka State Police Crime Intelligence
          </p>
        </div>

      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-data text-xs font-bold tracking-widest" style={{ color: "var(--red)" }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}
