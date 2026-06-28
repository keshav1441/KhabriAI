"use client";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  rows: Record<string, unknown>[];
}

// Vivid palette that reads on both light and dark backgrounds
const PALETTE = [
  "#E63946", "#3B82F6", "#F0A500", "#2DCA6F",
  "#8B5CF6", "#06B6D4", "#F97316", "#EC4899",
  "#10B981", "#6366F1", "#EF4444", "#14B8A6",
];

function detectKeys(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]);
  const labelKey =
    keys.find((k) => typeof rows[0][k] === "string") ?? keys[0];
  const numKeys = keys.filter(
    (k) => k !== labelKey && !isNaN(Number(rows[0][k])) && rows[0][k] !== null
  );
  const valueKey = numKeys[0] ?? keys[1];
  return { labelKey, valueKey, numKeys };
}

function formatLabel(val: unknown): string {
  if (val instanceof Date)
    return val.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  const s = String(val ?? "");
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}

// Shared tooltip style (works in both themes via CSS vars)
const TIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};
const TIP_LABEL_STYLE = { color: "var(--text-secondary)" };

export function CrimeChart({ rows }: Props) {
  if (!rows.length) return null;

  const { labelKey, valueKey, numKeys } = detectKeys(rows);

  const isTimeSeries =
    labelKey.toLowerCase().includes("month") ||
    labelKey.toLowerCase().includes("week") ||
    labelKey.toLowerCase().includes("date") ||
    labelKey.toLowerCase().includes("year");

  // Pie: categorical, ≤ 14 rows, single value column
  const isPie = !isTimeSeries && rows.length <= 14 && numKeys.length === 1;

  const data = rows.slice(0, 30).map((r) => ({
    name: formatLabel(r[labelKey]),
    value: Number(r[valueKey] ?? 0),
    // Extra numeric keys for multi-bar
    ...Object.fromEntries(numKeys.slice(1).map((k) => [k, Number(r[k] ?? 0)])),
  }));

  const axisStyle = { fill: "var(--text-muted)", fontSize: 11 };
  const gridStroke = "var(--border)";

  /* ── Pie chart ─────────────────────────────────────── */
  if (isPie) {
    const total = data.reduce((s, d) => s + d.value, 0);
    const RADIAN = Math.PI / 180;
    const renderLabel = (props: {
      cx?: number | string; cy?: number | string; midAngle?: number;
      innerRadius?: number; outerRadius?: number; percent?: number;
    }) => {
      const percent = Number(props.percent ?? 0);
      if (percent < 0.04) return null;
      const cx = Number(props.cx ?? 0);
      const cy = Number(props.cy ?? 0);
      const midAngle = Number(props.midAngle ?? 0);
      const innerRadius = Number(props.innerRadius ?? 0);
      const outerRadius = Number(props.outerRadius ?? 0);
      const r = innerRadius + (outerRadius - innerRadius) * 0.55;
      const x = cx + r * Math.cos(-midAngle * RADIAN);
      const y = cy + r * Math.sin(-midAngle * RADIAN);
      return (
        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
          {(percent * 100).toFixed(0)}%
        </text>
      );
    };

    return (
      <div className="mt-3 px-4 pb-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div style={{ width: 220, height: 220, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  labelLine={false}
                  label={renderLabel}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TIP_STYLE}
                  labelStyle={TIP_LABEL_STYLE}
                  formatter={(v) => {
                    const n = Number(v) || 0;
                    return [`${n.toLocaleString()} (${((n / total) * 100).toFixed(1)}%)`, "Count"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <span
                  className="shrink-0 rounded-sm"
                  style={{ width: 10, height: 10, background: PALETTE[i % PALETTE.length] }}
                />
                <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {d.name}
                </span>
                <span
                  className="ml-auto font-data text-xs shrink-0"
                  style={{ color: "var(--text-primary)" }}
                >
                  {d.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Line chart (time series) ───────────────────────── */
  if (isTimeSeries) {
    return (
      <div className="mt-3 px-2 pb-2" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" tick={axisStyle} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={TIP_STYLE} labelStyle={TIP_LABEL_STYLE} />
            <Line
              type="monotone"
              dataKey="value"
              name="Cases"
              stroke="#E63946"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#E63946" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── Bar chart (default) ────────────────────────────── */
  const multiBar = numKeys.length > 1;
  return (
    <div className="mt-3 px-2 pb-2" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: data.length > 6 ? 40 : 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis
            dataKey="name"
            tick={axisStyle}
            angle={data.length > 6 ? -35 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            interval={0}
          />
          <YAxis tick={axisStyle} />
          <Tooltip contentStyle={TIP_STYLE} labelStyle={TIP_LABEL_STYLE} />
          {multiBar && <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />}
          {multiBar ? (
            numKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
            ))
          ) : (
            <Bar dataKey="value" name="Cases" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
