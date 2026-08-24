"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { FeedbackStats } from "@/lib/feedback";

/**
 * The one claim this console has to make good on: corrections go in, answers
 * get better. Satisfaction is the noisy line, the learned bank is the
 * monotonic one, so they need separate axes to sit in the same frame.
 */

// Literal hexes rather than tokens: Recharts writes stroke as an SVG
// presentation attribute, which never resolves a custom property. Both read on
// the khaki paper and on the dark surface.
const SATISFACTION = "#2DCA6F";
const LEARNED = "#3B82F6";

const TIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};
const TIP_LABEL_STYLE = { color: "var(--text-secondary)" };

const shortDate = (d: string) => {
  const parsed = new Date(`${d}T00:00:00`);
  return isNaN(parsed.valueOf())
    ? d
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export function AccuracyChart({ daily }: { daily: FeedbackStats["daily"] }) {
  if (!daily.length) {
    return (
      <div className="flex items-center justify-center" style={{ height: 260 }}>
        <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
          No ratings in this window yet.
        </span>
      </div>
    );
  }

  // A day nobody rated has satisfaction null. It is passed through untouched —
  // plotted as zero it would read as "every answer was wrong that day".
  const data = daily.map((d) => ({
    name: shortDate(d.date),
    satisfaction: d.satisfaction,
    learned: d.learned,
    rated: d.up + d.down,
  }));

  const axisStyle = { fill: "var(--text-muted)", fontSize: 11 };

  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 28, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tick={axisStyle}
            angle={data.length > 8 ? -35 : 0}
            textAnchor={data.length > 8 ? "end" : "middle"}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="sat"
            domain={[0, 100]}
            tick={axisStyle}
            width={44}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            yAxisId="learned"
            orientation="right"
            allowDecimals={false}
            tick={axisStyle}
            width={40}
          />
          <Tooltip
            contentStyle={TIP_STYLE}
            labelStyle={TIP_LABEL_STYLE}
            formatter={(value, name) =>
              name === "Satisfaction"
                ? [value === null || value === undefined ? "no ratings" : `${value}%`, name]
                : [String(value), name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
          <Line
            yAxisId="sat"
            type="monotone"
            dataKey="satisfaction"
            name="Satisfaction"
            stroke={SATISFACTION}
            strokeWidth={2.5}
            // Bridges the unrated days so the trend stays one line; the missing
            // days simply carry no dot.
            connectNulls
            dot={{ r: 3, fill: SATISFACTION }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="learned"
            type="stepAfter"
            dataKey="learned"
            name="Learned examples (cumulative)"
            stroke={LEARNED}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
