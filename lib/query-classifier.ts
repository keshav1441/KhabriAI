export type VizType = "table" | "chart" | "graph";

export function classifyQuery(sql: string): VizType {
  const upper = sql.toUpperCase();

  // Network/graph: accused linked across multiple cases. Require the AccusedName
  // COLUMN (what the graph renders) — not just any query touching the Accused
  // table, or demographic aggregates (age/gender by group) would render as an
  // empty graph instead of a chart.
  if (
    upper.includes("ACCUSEDNAME") &&
    upper.includes("GROUP BY") &&
    upper.includes("COUNT")
  ) return "graph";

  // Chart: district/area aggregates (formerly "map")
  if (
    upper.includes("GROUP BY") &&
    (upper.includes("DISTRICTNAME") || upper.includes("DISTRICT_NAME") ||
     upper.includes("UNITNAME") || upper.includes("UNIT_NAME"))
  ) return "chart";

  // Chart: time-series or any count aggregate
  if (
    upper.includes("GROUP BY") &&
    (upper.includes("DATE_TRUNC") || upper.includes("MONTH") ||
     upper.includes("WEEK") || upper.includes("YEAR") ||
     upper.includes("DATE"))
  ) return "chart";

  if (upper.includes("GROUP BY") && upper.includes("COUNT")) return "chart";

  return "table";
}
