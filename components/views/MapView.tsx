"use client";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
import { PatrolPriorities } from "./PatrolPriorities";
import { CaseDrawer } from "../viz/CaseDrawer";
// Type-only: hotspot-forecast imports Prisma, which must never reach the bundle.
import type { HotspotForecast, HotspotDistrict } from "@/lib/hotspot-forecast";
// map-points takes its db client as an argument, so only the pure half compiles in.
import { thinPoints, cellDegForZoom, gmapsUrl, type IncidentPoint, type Bounds } from "@/lib/map-points";

const DISTRICT_COORDS: Record<string, [number, number]> = {
  "Bagalkot": [16.1826, 75.6966], "Ballari": [15.1394, 76.9214],
  "Belagavi": [15.8497, 74.4977], "Bengaluru Rural": [13.2257, 77.5761],
  "Bengaluru Urban": [12.9716, 77.5946], "Bidar": [17.9104, 77.5199],
  "Chamarajanagar": [11.9246, 76.9437], "Chikkaballapura": [13.4355, 77.7315],
  "Chikkamagaluru": [13.3153, 75.7754], "Chitradurga": [14.2251, 76.3980],
  "Dakshina Kannada": [12.8438, 74.9900], "Davanagere": [14.4644, 75.9218],
  "Dharwad": [15.4589, 75.0078], "Gadag": [15.4167, 75.6167],
  "Hassan": [13.0068, 76.1004], "Haveri": [14.7939, 75.3996],
  "Kalaburagi": [17.3297, 76.8200], "Kodagu": [12.4209, 75.7397],
  "Kolar": [13.1357, 78.1291], "Koppal": [15.3485, 76.1548],
  "Mandya": [12.5236, 76.8960], "Mysuru": [12.2958, 76.6394],
  "Raichur": [16.2120, 77.3439], "Ramanagara": [12.7157, 77.2823],
  "Shivamogga": [13.9299, 75.5681], "Tumakuru": [13.3392, 77.1008],
  "Udupi": [13.3409, 74.7421], "Uttara Kannada": [14.7907, 74.6884],
  "Vijayapura": [16.8302, 75.7100], "Yadgir": [16.7713, 77.1378],
};

type District = { name: string; count: number };
type Layer = "observed" | "predicted" | "incidents";

/** Hard DOM ceiling. The server already caps the fetch; this is the second lock. */
const MARKER_BUDGET = 4000;
const REFETCH_DEBOUNCE_MS = 400;

/** One row of whichever layer is active — `count` is what sizes the pin. */
type Row = { name: string; count: number; forecast?: HotspotDistrict };

const CONFIDENCE_KEY: Record<HotspotDistrict["confidence"], StringKey> = {
  low: "hotspot.confidence.low",
  medium: "hotspot.confidence.medium",
  high: "hotspot.confidence.high",
};
const CONFIDENCE_COLOR: Record<HotspotDistrict["confidence"], string> = {
  low: "var(--text-muted)",
  medium: "var(--amber)",
  high: "var(--red)",
};

function fuzzyCoords(name: string): [number, number] | null {
  if (DISTRICT_COORDS[name]) return DISTRICT_COORDS[name];
  const key = Object.keys(DISTRICT_COORDS).find(
    (k) => k.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(k.toLowerCase())
  );
  return key ? DISTRICT_COORDS[key] : null;
}

// Popups are raw HTML strings; crime group names come from the database, so
// escape before interpolating rather than trusting the corpus.
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function MapView() {
  const lang = useChatStore((s) => s.lang);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("leaflet").Map | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);

  const [layer, setLayer] = useState<Layer>("observed");
  const [forecast, setForecast] = useState<HotspotForecast | null>(null);
  const [scope, setScope] = useState<string | undefined>();
  const [forecastState, setForecastState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [showPriorities, setShowPriorities] = useState(false);

  // Incident layer. `mapEpoch` bumps whenever a Leaflet map is (re)built, which
  // is how the incident effects learn there is an instance to attach to.
  const [mapEpoch, setMapEpoch] = useState(0);
  const [points, setPoints] = useState<IncidentPoint[]>([]);
  const [pointMeta, setPointMeta] = useState({ total: 0, missingCoords: 0, capped: false });
  const [pointState, setPointState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [shown, setShown] = useState(0);
  const [zoom, setZoom] = useState(7);
  const [openCaseId, setOpenCaseId] = useState<number | null>(null);
  const pointSeq = useRef(0);

  // Without the catch a failed load left the loading curtain over the map for
  // good — the officer sees a spinner that never resolves and no reason why.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/map-data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("map-data failed"))))
      .then((d) => { if (!cancelled) { setDistricts(d.districts ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setDataError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // The fit is expensive and cached server-side for hours; nobody who stays on
  // the observed layer should pay for it, so it loads on first demand only.
  const loadForecast = () => {
    if (forecastState !== "idle") return;
    setForecastState("loading");
    fetch("/api/forecast/hotspots?horizon=30")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("forecast failed"))))
      .then((d) => { setForecast(d.forecast ?? null); setScope(d.scope); setForecastState("ready"); })
      .catch(() => setForecastState("error"));
  };

  // Points are fetched per viewport, not once for the state. That is what makes
  // the cap tolerable: statewide you get a capped sample and are told so; zoom
  // to a taluk and the same cap returns every FIR inside it.
  const loadPoints = useCallback((b?: Bounds) => {
    const seq = ++pointSeq.current;
    setPointState((s) => (s === "ready" ? s : "loading"));
    const bbox = b ? `&bbox=${[b.south, b.west, b.north, b.east].map((v) => v.toFixed(4)).join(",")}` : "";
    fetch(`/api/map-data?mode=points${bbox}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("points failed"))))
      .then((d) => {
        if (seq !== pointSeq.current) return; // a later pan already superseded this
        setPoints(d.points ?? []);
        setPointMeta({ total: d.total ?? 0, missingCoords: d.missingCoords ?? 0, capped: Boolean(d.capped) });
        setPointState("ready");
      })
      .catch(() => { if (seq === pointSeq.current) setPointState("error"); });
  }, []);

  const rows: Row[] = useMemo(
    () =>
      layer === "predicted"
        ? (forecast?.districts ?? []).map((f) => ({ name: f.district, count: f.predicted30, forecast: f }))
        : districts,
    [layer, forecast, districts]
  );

  // The Leaflet instance is built once and outlives every layer switch. It used
  // to be rebuilt whenever the rows changed, which blanked the map for as long
  // as a cold forecast took to arrive — and forever if it failed — and threw
  // away the officer's pan and zoom every time they toggled the language.
  useEffect(() => {
    if (loading || !mapRef.current) return;
    if (typeof window === "undefined") return;

    let cancelled = false; // guard against the dynamic import resolving post-unmount
    const container = mapRef.current;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || mapInstance.current) return;

      const map = L.map(container, { zoomControl: true, scrollWheelZoom: true });
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Fit to Karnataka bounds — don't use setView which shows all of India
      map.fitBounds([[11.5, 74.0], [18.5, 78.5]], { padding: [20, 20] });
      // Only resize if this map is still the mounted instance — else Leaflet
      // throws "_leaflet_pos" on a removed map when the tab switches fast.
      setTimeout(() => { if (mapInstance.current === map) map.invalidateSize(); }, 200);

      setMapEpoch((e) => e + 1); // the marker effects hang off this, not off a ref
    });

    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null; };
  }, [loading]);

  // District pins for the observed and predicted layers, in their own group so
  // that swapping layers, refreshing the forecast or switching language redraws
  // the markers and leaves the map — and the current viewport — alone.
  useEffect(() => {
    const map = mapInstance.current;
    // The incident layer draws its own markers from CaseMaster coordinates —
    // district centroids would only clutter the real ones.
    if (!map || layer === "incidents" || !rows.length) return;

    let cancelled = false;
    let group: import("leaflet").LayerGroup | null = null;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || mapInstance.current !== map) return;
      group = L.layerGroup().addTo(map);

      const maxCount = Math.max(...rows.map((d) => d.count), 1);

      for (const dist of rows) {
        const coords = fuzzyCoords(dist.name);
        if (!coords) continue;
        const [lat, lng] = coords;
        const pct = dist.count / maxCount;

        // Observed: deep red for hotspots, muted red for low. Predicted rides an
        // amber→red ramp instead, so nobody mistakes a projection for a count.
        const pinColor =
          layer === "observed"
            ? `rgb(${Math.round(180 + pct * 55)},${Math.round(30 + (1 - pct) * 60)},${Math.round(30 + (1 - pct) * 30)})`
            : `rgb(${Math.round(200 + pct * 35)},${Math.round(150 - pct * 110)},${Math.round(40 + (1 - pct) * 20)})`;
        const pinSize = Math.round(20 + pct * 14); // 20–34px

        const pinSvg = `
          <svg width="${pinSize}" height="${Math.round(pinSize * 1.4)}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.27 21.73 0 14 0z"
                  fill="${pinColor}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
            <circle cx="14" cy="13" r="5" fill="white" fill-opacity="0.9"/>
          </svg>`;

        const icon = L.divIcon({
          html: pinSvg,
          className: "",
          iconSize: [pinSize, Math.round(pinSize * 1.4)],
          iconAnchor: [pinSize / 2, Math.round(pinSize * 1.4)],
          popupAnchor: [0, -Math.round(pinSize * 1.4)],
        });

        const mapsUrl = gmapsUrl(lat, lng);
        const rank = rows.findIndex((d) => d.name === dist.name) + 1;
        const f = dist.forecast;

        // A projected number never appears without its confidence beside it.
        const body = f
          ? `<div style="font-size:12px;margin:2px 0 4px">
               <span style="color:#666">${esc(t("hotspot.observed30", lang))}</span>
               <b>${f.observed30.toLocaleString()}</b>
               <span style="color:#666">→</span>
               <b style="color:#E63946">${f.predicted30.toLocaleString()}</b>
               <span style="color:${f.delta >= 0 ? "#B21F26" : "#2C6B57"};font-weight:600">
                 ${f.delta >= 0 ? "+" : ""}${f.deltaPct}%
               </span>
             </div>
             <div style="font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#666">
               ${esc(t("hotspot.confidence", lang))}: <b>${esc(t(CONFIDENCE_KEY[f.confidence], lang))}</b>
             </div>
             ${f.drivers.length ? `
               <div style="margin-top:5px;font-size:11px">
                 <div style="color:#999;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em">${esc(t("hotspot.drivers", lang))}</div>
                 ${f.drivers.map((d) => `<div>${esc(d.crimeGroup)} <b style="color:#9A6410">+${d.slopePerMonth}</b>${esc(t("hotspot.perMonth", lang))}</div>`).join("")}
               </div>` : ""}`
          : `<span style="font-size:12px;color:#E63946;font-weight:600">${dist.count.toLocaleString()} ${esc(t("map.cases", lang))}</span><br/>`;

        L.marker([lat, lng], { icon }).addTo(group!).bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px">
            <div style="font-size:10px;color:#999;font-family:monospace;text-transform:uppercase;letter-spacing:.08em">${esc(t("map.rank", lang))} #${rank}</div>
            <b style="font-size:13px;display:block;margin:2px 0">${esc(dist.name)}</b>
            ${body}
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
               style="color:#1D4ED8;font-size:11px;text-decoration:none;margin-top:6px;display:inline-flex;align-items:center;gap:3px">
              ${esc(t("map.openInGmaps", lang))}
            </a>
          </div>
        `);
      }
    });

    return () => {
      cancelled = true;
      if (group && mapInstance.current === map) map.removeLayer(group);
    };
  }, [mapEpoch, rows, layer, lang]);

  // Viewport tracking for the incident layer: zoom drives how coarse the grid
  // is, and a settled pan triggers a refetch for the new box.
  useEffect(() => {
    const map = mapInstance.current;
    if (layer !== "incidents" || !map) return;

    const boxOf = () => {
      const b = map.getBounds();
      return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      setZoom(map.getZoom());
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadPoints(boxOf()), REFETCH_DEBOUNCE_MS);
    };

    setZoom(map.getZoom());
    loadPoints(boxOf());
    map.on("moveend", onMove);
    return () => { if (timer) clearTimeout(timer); map.off("moveend", onMove); };
  }, [layer, mapEpoch, loadPoints]);

  // Marker layer for the incident points. Rebuilt whenever the data or the zoom
  // changes; never added to the map that is already gone.
  useEffect(() => {
    const map = mapInstance.current;
    if (layer !== "incidents" || !map) return;

    let cancelled = false;
    let group: import("leaflet").LayerGroup | null = null;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || mapInstance.current !== map) return;
      group = L.layerGroup().addTo(map);

      const thinned = thinPoints(points, { cellDeg: cellDegForZoom(zoom), cap: MARKER_BUDGET });
      setShown(thinned.shown);

      for (const c of thinned.clusters) {
        const single = c.count === 1;
        const size = single ? 12 : Math.min(40, 20 + Math.round(Math.log2(c.count) * 5));
        const html = single
          ? `<div style="width:12px;height:12px;border-radius:50%;background:#E63946;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 1px rgba(0,0,0,.3)"></div>`
          : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(230,57,70,.82);border:2px solid rgba(255,255,255,.9);color:#fff;display:flex;align-items:center;justify-content:center;font:600 ${size < 28 ? 10 : 11}px system-ui,sans-serif">${c.count.toLocaleString()}</div>`;

        const marker = L.marker([c.lat, c.lng], {
          icon: L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        }).addTo(group!);

        if (single) {
          const s = c.sample;
          marker.bindTooltip(
            `<b>${esc(s.crimeNo ?? "—")}</b><br/>${esc(s.crimeType ?? s.crimeGroup ?? "")}<br/>` +
            `<span style="color:#666">${esc(s.station ?? "")}${s.date ? ` · ${esc(s.date)}` : ""}</span>`,
            { direction: "top", offset: [0, -8] }
          );
          // The view hosts the drawer, so a point goes straight to the case.
          marker.on("click", () => setOpenCaseId(s.id));
        } else {
          marker.bindTooltip(`${c.count.toLocaleString()} ${esc(t("map.cases", lang))}`, { direction: "top", offset: [0, -size / 2] });
          marker.on("click", () => map.setView([c.lat, c.lng], Math.min(18, map.getZoom() + 2)));
        }
      }
    });

    return () => {
      cancelled = true;
      if (group && mapInstance.current === map) map.removeLayer(group);
    };
  }, [layer, mapEpoch, points, zoom, lang]);

  const maxCount = Math.max(...rows.map((d) => d.count), 1);
  const predicting = layer === "predicted";
  const plotting = layer === "incidents";

  // When the active layer has nothing to pin, say why. An empty tile grid reads
  // as a broken map, and a forecast that failed or is still fitting used to
  // leave exactly that — the old overlay only spoke once the fit had succeeded.
  const blank: { text: string; tone: string } | null = (() => {
    if (loading || plotting || rows.length) return null;
    if (predicting) {
      if (forecastState === "error") return { text: t("hotspot.error", lang), tone: "var(--red)" };
      if (forecastState === "ready") return { text: t("hotspot.empty", lang), tone: "var(--text-muted)" };
      return { text: t("hotspot.loading", lang), tone: "var(--text-muted)" };
    }
    return dataError ? { text: "Could not load the crime map.", tone: "var(--red)" } : null;
  })();

  const switchLayer = (next: Layer) => {
    setLayer(next);
    if (next === "predicted") loadForecast();
    else setShowPriorities(false);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Map + layer toolbar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="shrink-0 flex items-center flex-wrap gap-3 px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}
        >
          <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            {t("map.layer", lang)}
          </span>
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["observed", "predicted", "incidents"] as Layer[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLayer(l)}
                className="font-data text-xs px-3 py-1 transition-all"
                style={{
                  background: layer === l ? "var(--red-dim)" : "transparent",
                  color: layer === l ? "var(--red)" : "var(--text-muted)",
                  fontWeight: layer === l ? 700 : 400,
                }}
              >
                {t(`map.layer.${l}` as StringKey, lang)}
              </button>
            ))}
          </div>

          <button
            onClick={() => { loadForecast(); setLayer("predicted"); setShowPriorities(true); }}
            className="font-data text-xs px-2.5 py-1 rounded-md transition-all"
            style={{ color: "var(--amber)", border: "1px solid var(--amber)", background: "var(--amber-dim)" }}
          >
            {t("hotspot.priorities", lang)} →
          </button>

          {predicting && scope && (
            <span className="font-data text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              {t("map.scope", lang)}: {scope}
            </span>
          )}
          {predicting && forecastState === "loading" && (
            <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>{t("hotspot.loading", lang)}</span>
          )}
          {predicting && forecastState === "error" && (
            <span className="font-data text-xs" style={{ color: "var(--red)" }}>{t("hotspot.error", lang)}</span>
          )}

          {/* Both numbers, always together: what is drawn, and what could not be. */}
          {plotting && pointState === "ready" && (
            <>
              <span className="font-data text-xs" style={{ color: "var(--red)" }}>
                {shown.toLocaleString()}
                {pointMeta.capped && ` / ${pointMeta.total.toLocaleString()}`}{" "}
                <span style={{ color: "var(--text-muted)" }}>{t("map.incidentCount", lang)}</span>
              </span>
              {pointMeta.missingCoords > 0 && (
                <span className="font-data text-xs" style={{ color: "var(--amber)" }}>
                  {pointMeta.missingCoords.toLocaleString()}{" "}
                  <span style={{ color: "var(--text-muted)" }}>{t("map.noCoords", lang)}</span>
                </span>
              )}
            </>
          )}
          {plotting && pointState === "loading" && (
            <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>{t("map.loading", lang)}</span>
          )}
          {plotting && pointState === "error" && (
            <span className="font-data text-xs" style={{ color: "var(--red)" }}>{t("hotspot.error", lang)}</span>
          )}
        </div>

        {plotting && (
          <div className="shrink-0 px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-raised)" }}>
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>{t("map.incidentHint", lang)}</p>
          </div>
        )}

        {/* Method disclosure — visible with the projection, not hidden in a tooltip. */}
        {predicting && forecast && (
          <div className="shrink-0 px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-raised)" }}>
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              <b>{t("hotspot.method", lang)}:</b> {forecast.method}{" "}
              <span className="font-data">{t("hotspot.monthsFitted", lang)}: {forecast.months.join(" · ")}</span>
            </p>
          </div>
        )}

        <div className="flex-1 relative min-h-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10"
                 style={{ background: "var(--bg-base)" }}>
              <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
                {t("map.loading", lang)}
              </span>
            </div>
          )}
          <div ref={mapRef} style={{ height: "100%", width: "100%" }} />

          {blank && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "var(--bg-base)" }}>
              <span className="font-data text-sm" style={{ color: blank.tone }}>{blank.text}</span>
            </div>
          )}

          {showPriorities && (
            <PatrolPriorities
              forecast={forecast}
              state={forecastState}
              scope={scope}
              onClose={() => setShowPriorities(false)}
            />
          )}
        </div>
      </div>

      {/* District list sidebar — follows the active layer */}
      <div
        className="w-64 shrink-0 flex flex-col overflow-hidden"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            {t(predicting ? "map.list.predicted" : "map.list.observed", lang)}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows.map((d, i) => {
            const coords = fuzzyCoords(d.name);
            const mapsUrl = coords
              ? gmapsUrl(coords[0], coords[1])
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.name + " Karnataka")}`;
            const pct = d.count / maxCount;
            const f = d.forecast;
            return (
              <a
                key={d.name}
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 border-b transition-all group"
                style={{ borderColor: "var(--border-subtle)", textDecoration: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-raised)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  className="font-data text-xs w-5 shrink-0 text-right"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {d.name}
                  </p>
                  {/* mini bar */}
                  <div className="mt-1 h-1 rounded-full" style={{ background: "var(--border)", width: "100%" }}>
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${(pct * 100).toFixed(0)}%`, background: `rgb(${Math.round(pct*255)},${Math.max(0,180-Math.round(pct*255))},60)` }}
                    />
                  </div>
                  {/* A projected count is never shown bare — confidence rides with it. */}
                  {f && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-data text-[10px]" style={{ color: CONFIDENCE_COLOR[f.confidence] }}>
                        {t(CONFIDENCE_KEY[f.confidence], lang)}
                      </span>
                      <span className="font-data text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {f.observed30.toLocaleString()} →
                      </span>
                    </div>
                  )}
                </div>
                <span className="font-data text-xs shrink-0 text-right" style={{ color: "var(--red)" }}>
                  {d.count.toLocaleString()}
                  {f && (
                    <span className="block font-data text-[10px]" style={{ color: f.delta >= 0 ? "var(--amber)" : "var(--green)" }}>
                      {f.delta >= 0 ? "+" : ""}{f.deltaPct}%
                    </span>
                  )}
                </span>
                <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--blue)" }}>↗</span>
              </a>
            );
          })}
        </div>
      </div>

      {/* A point on the map is a case, so clicking one lands in the same drawer
          the desk and the results table open. */}
      <CaseDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
    </div>
  );
}
