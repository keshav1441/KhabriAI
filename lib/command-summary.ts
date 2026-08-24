/**
 * Shaping for the command centre.
 *
 * The screen is a new presentation of work that already exists: every number
 * below arrives from an endpoint that computed it. What lives here is only the
 * arithmetic of assembling seven headline figures out of seven independent
 * payloads — pulled out of the view so it can be tested without a browser, and
 * so the two rules that matter are stated once:
 *
 *   1. A panel that failed shows a *blank* figure. A confident "0 overdue" on
 *      a screen an officer trusts is worse than an em-dash.
 *   2. An endpoint that refuses this caller is not a failure. /api/admin/
 *      data-quality 403s for everyone who is not a reviewer, which is most
 *      officers; the tile simply is not theirs and is dropped without a word.
 */

// ---- Panel outcomes --------------------------------------------------------

export type PanelResult<T> =
  | { state: "ok"; data: T }
  /** The endpoint answered, but not for this caller — nothing is wrong. */
  | { state: "unavailable" }
  | { state: "failed" };

/**
 * One fetch's outcome. 401/403 mean "not yours", which the command centre
 * treats as absence; anything else non-2xx, or a body that would not parse,
 * is a failure the panel should own up to.
 */
export function panelFromResponse<T>(status: number, body: T | null | undefined): PanelResult<T> {
  if (status === 401 || status === 403) return { state: "unavailable" };
  if (status < 200 || status >= 300) return { state: "failed" };
  if (body == null) return { state: "failed" };
  return { state: "ok", data: body };
}

/** The payload when the panel loaded, otherwise nothing — the `??` guard the figures use. */
export function dataOf<T>(r: PanelResult<T> | null | undefined): T | null {
  return r && r.state === "ok" ? r.data : null;
}

// ---- Severity ---------------------------------------------------------------

export type Tone = "critical" | "warning" | "info" | "neutral";

/** The same three colours the alert bell uses; neutral is for a figure at rest. */
export const TONE_COLOR: Record<Tone, string> = {
  critical: "var(--red)",
  warning: "var(--amber)",
  info: "var(--khaki)",
  neutral: "var(--text-primary)",
};

/** An unknown severity reads as info, not as an alarm. */
export function severityTone(severity: string | null | undefined): Tone {
  return severity === "critical" || severity === "warning" || severity === "info" ? severity : "info";
}

export function severityColor(severity: string | null | undefined): string {
  return TONE_COLOR[severityTone(severity)];
}

// ---- Payload shapes (only the fields the band reads) ------------------------

export interface PendencyPayload {
  summary?: { openCases?: number | null; overdue?: number | null; noArrest?: number | null; medianAgeDays?: number | null } | null;
  scope?: string | null;
}

export interface CustodyPayload {
  summary?: { noneBroughtIn?: number | null; csNoCustody?: number | null; liveCases?: number | null } | null;
}

export interface AlertsPayload {
  unread?: number | null;
  last24h?: number | null;
}

export interface ForecastDistrict {
  districtId: number;
  district: string;
  predicted: number;
  delta: number;
  confidence: "low" | "medium" | "high";
}

export interface ForecastPayload {
  forecast?: { districts?: ForecastDistrict[] | null } | null;
}

export interface BottleneckPayload {
  stage: string;
  fromStage: string;
  medianDays: number;
  reached: number;
}

export interface PipelinePayload {
  totalCases?: number | null;
  bottleneck?: BottleneckPayload | null;
}

export interface QualityPayload {
  report?: { score?: number | null; failingChecks?: number | null } | null;
}

// ---- The headline band -----------------------------------------------------

export type FigureId =
  | "openCases"
  | "overdue"
  | "noneBroughtIn"
  | "unreadAlerts"
  | "hottestDistrict"
  | "bottleneck"
  | "dataQuality";

export interface Figure {
  id: FigureId;
  /** An existing i18n key, or a literal for the reviewer tile — the admin screens are not translated either. */
  label: { key: string } | { text: string };
  /** Already formatted. null means "we do not know", and renders as a dash. */
  value: string | null;
  /** The line under the number: a district name, a bottleneck leg, a count. */
  note: string | null;
  tone: Tone;
  /** Which view this figure belongs to, for the caller's router. */
  view: string;
}

export interface FigureInputs {
  pendency: PanelResult<PendencyPayload> | null;
  custody: PanelResult<CustodyPayload> | null;
  alerts: PanelResult<AlertsPayload> | null;
  forecast: PanelResult<ForecastPayload> | null;
  pipeline: PanelResult<PipelinePayload> | null;
  quality: PanelResult<QualityPayload> | null;
}

/** A count we actually received. Anything absent stays null rather than collapsing to 0. */
function count(n: number | null | undefined): string | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n).toLocaleString("en-IN") : null;
}

/** A sub-line, but only when the number behind it exists. */
function note(n: number | null | undefined, phrase: (v: string) => string): string | null {
  const c = count(n);
  return c === null ? null : phrase(c);
}

/**
 * The hottest projected district.
 *
 * Ties are real — two districts can project the same case count — so the order
 * is fully determined: most projected cases, then the one climbing fastest
 * (delta), then district name, so the headline never flickers between two
 * equals on a reload.
 */
export function pickHottestDistrict(districts: ForecastDistrict[] | null | undefined): ForecastDistrict | null {
  if (!districts?.length) return null;
  return [...districts].sort(
    (a, b) => b.predicted - a.predicted || b.delta - a.delta || a.district.localeCompare(b.district)
  )[0];
}

/**
 * The bottleneck as one line: which leg of the funnel is slow, and by how much.
 * The stage names are i18n keys the pipeline module already owns, so the label
 * lookup is injected rather than imported — this module stays renderer-free.
 */
export function formatBottleneck(
  b: BottleneckPayload | null | undefined,
  label: (stageId: string) => string
): string | null {
  if (!b) return null;
  return `${label(b.fromStage)} → ${label(b.stage)} · ${b.reached.toLocaleString("en-IN")} cases`;
}

/** The confidence of the hottest district, when it has one — the forecast never asserts without it. */
export function hottestTone(d: ForecastDistrict | null): Tone {
  if (!d) return "neutral";
  return d.confidence === "high" ? "critical" : d.confidence === "medium" ? "warning" : "info";
}

/**
 * The band, left to right. A figure whose panel failed keeps its slot with a
 * blank value — the officer should see that the number is missing, not that it
 * is zero — but a figure this caller is not entitled to is dropped entirely.
 */
export function buildFigures(inputs: FigureInputs, label: (stageId: string) => string): Figure[] {
  const desk = dataOf(inputs.pendency)?.summary ?? null;
  const custody = dataOf(inputs.custody)?.summary ?? null;
  const alerts = dataOf(inputs.alerts);
  const hottest = pickHottestDistrict(dataOf(inputs.forecast)?.forecast?.districts);
  const pipeline = dataOf(inputs.pipeline);
  const overdue = desk?.overdue ?? null;
  const unread = alerts?.unread ?? null;

  const figures: Figure[] = [
    {
      id: "openCases",
      label: { key: "desk.title" },
      value: count(desk?.openCases),
      note: note(desk?.medianAgeDays, (v) => `median ${v}d`),
      tone: "neutral",
      view: "desk",
    },
    {
      id: "overdue",
      label: { key: "desk.csOverdue" },
      value: count(overdue),
      note: null,
      // Zero overdue is good news and should not be painted as an emergency.
      tone: overdue ? "critical" : "neutral",
      view: "desk",
    },
    {
      id: "noneBroughtIn",
      label: { key: "custody.none" },
      value: count(custody?.noneBroughtIn),
      note: note(custody?.csNoCustody, (v) => `${v} chargesheeted`),
      tone: custody?.noneBroughtIn ? "warning" : "neutral",
      view: "desk",
    },
    {
      id: "unreadAlerts",
      label: { key: "alerts.title" },
      value: count(unread),
      note: note(alerts?.last24h, (v) => `${v} in 24h`),
      tone: unread ? "critical" : "neutral",
      view: "chat",
    },
    {
      id: "hottestDistrict",
      label: { key: "hotspot.predicted30" },
      value: hottest ? hottest.district : null,
      note: hottest ? `${count(hottest.predicted)} cases` : null,
      tone: hottestTone(hottest),
      view: "map",
    },
    {
      id: "bottleneck",
      label: { key: "pipeline.bottleneck" },
      value: pipeline?.bottleneck ? `${count(pipeline.bottleneck.medianDays)}d` : null,
      note: formatBottleneck(pipeline?.bottleneck, label),
      tone: pipeline?.bottleneck ? "warning" : "neutral",
      view: "pipeline",
    },
  ];

  // Reviewer-only, and quietly absent otherwise: a 403 here is the access rule
  // working, not an endpoint that broke.
  if (inputs.quality && inputs.quality.state !== "unavailable") {
    const report = dataOf(inputs.quality)?.report ?? null;
    const score = report?.score ?? null;
    figures.push({
      id: "dataQuality",
      // The admin screens carry no translations; a key here would be the only one.
      label: { text: "Data quality" },
      value: typeof score === "number" ? `${Math.round(score)}` : null,
      note: note(report?.failingChecks, (v) => `${v} checks failing`),
      tone: typeof score === "number" && score < 70 ? "warning" : "neutral",
      view: "reports",
    });
  }

  return figures;
}

// ---- Map summary -----------------------------------------------------------

export interface MapPoint {
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface MapPointsPayload {
  points?: MapPoint[] | null;
  total?: number | null;
  missingCoords?: number | null;
}

export interface MapDistrictShare {
  district: string;
  count: number;
  share: number;
}

/**
 * The incident layer, counted rather than drawn — see the note in CommandView
 * on why this screen does not mount a second Leaflet map.
 */
export function summariseMapPoints(payload: MapPointsPayload | null, top = 5): MapDistrictShare[] {
  const points = payload?.points ?? [];
  if (!points.length) return [];
  const byDistrict = new Map<string, number>();
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    const d = p.district ?? "—";
    byDistrict.set(d, (byDistrict.get(d) ?? 0) + 1);
  }
  const placed = [...byDistrict.values()].reduce((a, b) => a + b, 0);
  if (!placed) return [];
  return [...byDistrict.entries()]
    .map(([district, n]) => ({ district, count: n, share: n / placed }))
    .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district))
    .slice(0, top);
}
