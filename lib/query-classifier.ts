export type VizType = "table" | "chart" | "graph";

export function classifyQuery(sql: string): VizType {
  const upper = sql.toUpperCase();

  // Network/graph: accused linked across multiple cases
  if (
    upper.includes("ACCUSED") &&
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
