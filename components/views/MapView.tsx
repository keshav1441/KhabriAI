"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

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

function fuzzyCoords(name: string): [number, number] | null {
  if (DISTRICT_COORDS[name]) return DISTRICT_COORDS[name];
  const key = Object.keys(DISTRICT_COORDS).find(
    (k) => k.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(k.toLowerCase())
  );
  return key ? DISTRICT_COORDS[key] : null;
}

function gmapsUrl(lat: number, lng: number, name: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " Karnataka")}`;
}

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("leaflet").Map | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<District | null>(null);

  useEffect(() => {
    fetch("/api/map-data")
      .then((r) => r.json())
      .then((d) => { setDistricts(d.districts ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current || !districts.length) return;
    if (typeof window === "undefined") return;

    let cancelled = false; // guard against the dynamic import resolving post-unmount

    import("leaflet").then(({ default: L }) => {
      if (cancelled || !mapRef.current) return;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true });
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Fit to Karnataka bounds — don't use setView which shows all of India
      map.fitBounds([[11.5, 74.0], [18.5, 78.5]], { padding: [20, 20] });
      // Only resize if this map is still the mounted instance — else Leaflet
      // throws "_leaflet_pos" on a removed map when the tab switches fast.
      setTimeout(() => { if (mapInstance.current === map) map.invalidateSize(); }, 200);

      const maxCount = Math.max(...districts.map((d) => d.count), 1);

      for (const dist of districts) {
        const coords = fuzzyCoords(dist.name);
        if (!coords) continue;
        const [lat, lng] = coords;
        const pct = dist.count / maxCount;

        // Color: deep red for hotspots, muted red for low
        const r = Math.round(180 + pct * 55);
        const g = Math.round(30 + (1 - pct) * 60);
        const b = Math.round(30 + (1 - pct) * 30);
        const pinColor = `rgb(${r},${g},${b})`;
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

        const mapsUrl = gmapsUrl(lat, lng, dist.name);
        const rank = districts.findIndex((d) => d.name === dist.name) + 1;

        L.marker([lat, lng], { icon }).addTo(map).bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:160px;padding:2px">
            <div style="font-size:10px;color:#999;font-family:monospace;text-transform:uppercase;letter-spacing:.08em">Rank #${rank}</div>
            <b style="font-size:13px;display:block;margin:2px 0">${dist.name}</b>
            <span style="font-size:12px;color:#E63946;font-weight:600">${dist.count.toLocaleString()} cases</span><br/>
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
               style="color:#1D4ED8;font-size:11px;text-decoration:none;margin-top:6px;display:inline-flex;align-items:center;gap:3px">
              Open in Google Maps ↗
            </a>
          </div>
        `);
      }
    });

    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null; };
  }, [loading, districts]);

  const maxCount = Math.max(...districts.map((d) => d.count), 1);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
               style={{ background: "var(--bg-base)" }}>
            <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
              Loading crime map…
            </span>
          </div>
        )}
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* District list sidebar */}
      <div
        className="w-64 shrink-0 flex flex-col overflow-hidden"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            Districts by Crime Count
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {districts.map((d, i) => {
            const coords = fuzzyCoords(d.name);
            const mapsUrl = coords
              ? gmapsUrl(coords[0], coords[1], d.name)
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.name + " Karnataka")}`;
            const pct = d.count / maxCount;
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
                </div>
                <span className="font-data text-xs shrink-0" style={{ color: "var(--red)" }}>
                  {d.count.toLocaleString()}
                </span>
                <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--blue)" }}>↗</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
