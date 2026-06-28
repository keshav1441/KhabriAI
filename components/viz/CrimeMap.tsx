"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

interface Props {
  rows: Record<string, unknown>[];
}

// Karnataka district centroids (real coordinates)
const DISTRICT_COORDS: Record<string, [number, number]> = {
  "Bagalkot": [16.1826, 75.6966],
  "Ballari": [15.1394, 76.9214],
  "Belagavi": [15.8497, 74.4977],
  "Bengaluru Rural": [13.2257, 77.5761],
  "Bengaluru Urban": [12.9716, 77.5946],
  "Bidar": [17.9104, 77.5199],
  "Chamarajanagar": [11.9246, 76.9437],
  "Chikkaballapura": [13.4355, 77.7315],
  "Chikkamagaluru": [13.3153, 75.7754],
  "Chitradurga": [14.2251, 76.3980],
  "Dakshina Kannada": [12.8438, 74.9900],
  "Davanagere": [14.4644, 75.9218],
  "Dharwad": [15.4589, 75.0078],
  "Gadag": [15.4167, 75.6167],
  "Hassan": [13.0068, 76.1004],
  "Haveri": [14.7939, 75.3996],
  "Kalaburagi": [17.3297, 76.8200],
  "Kodagu": [12.4209, 75.7397],
  "Kolar": [13.1357, 78.1291],
  "Koppal": [15.3485, 76.1548],
  "Mandya": [12.5236, 76.8960],
  "Mysuru": [12.2958, 76.6394],
  "Raichur": [16.2120, 77.3439],
  "Ramanagara": [12.7157, 77.2823],
  "Shivamogga": [13.9299, 75.5681],
  "Tumakuru": [13.3392, 77.1008],
  "Udupi": [13.3409, 74.7421],
  "Uttara Kannada": [14.7907, 74.6884],
  "Vijayapura": [16.8302, 75.7100],
  "Yadgir": [16.7713, 77.1378],
};

function getDistrictCoords(name: string): [number, number] | null {
  if (DISTRICT_COORDS[name]) return DISTRICT_COORDS[name];
  // fuzzy: try partial match
  const key = Object.keys(DISTRICT_COORDS).find(
    (k) => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase())
  );
  return key ? DISTRICT_COORDS[key] : null;
}

export function CrimeMap({ rows }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || typeof window === "undefined") return;

    let L: typeof import("leaflet");
    import("leaflet").then((mod) => {
      L = mod.default;

      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: false });
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      map.setView([14.5, 75.7], 7);
      // Force tile recalculation after container is fully painted
      setTimeout(() => map.invalidateSize(), 150);

      // Case 1: rows have explicit lat/lng
      const validRows = rows.filter(
        (r) => r.lat !== undefined && r.lng !== undefined &&
               r.lat !== null && r.lng !== null &&
               !isNaN(Number(r.lat)) && !isNaN(Number(r.lng))
      );

      if (validRows.length > 0) {
        const maxCount = Math.max(...validRows.map((r) => Number(r.incidents ?? r.total_cases ?? r.total ?? r.count ?? 1)));
        for (const r of validRows) {
          const count = Number(r.incidents ?? r.total_cases ?? r.total ?? r.count ?? 1);
          const radius = 5 + (count / maxCount) * 25;
          const heat = Math.min(255, Math.round((count / maxCount) * 255));
          const color = `rgb(${heat},${Math.max(0, 200 - heat)},60)`;
          L.circleMarker([Number(r.lat), Number(r.lng)], {
            radius,
            fillColor: color,
            color: "#000",
            weight: 0.5,
            fillOpacity: 0.75,
          })
            .bindPopup(`<b>${r.station ?? r.district ?? ""}</b><br>${count} cases`)
            .addTo(map);
        }
        return;
      }

      // Case 2: district/station grouping — use real coordinates
      const districtGroups: Record<string, { count: number; coords: [number, number] | null }> = {};
      for (const r of rows) {
        const districtRaw = String(
          r.DistrictName ?? r.district_name ?? r.district ?? r.UnitName ?? r.station ?? "Unknown"
        );
        const count = Number(r.incidents ?? r.total_cases ?? r.total ?? r.count ?? r.case_count ?? 1);
        if (!districtGroups[districtRaw]) {
          districtGroups[districtRaw] = {
            count: 0,
            coords: getDistrictCoords(districtRaw),
          };
        }
        districtGroups[districtRaw].count += count;
      }

      const allCounts = Object.values(districtGroups).map((v) => v.count);
      const maxCount = Math.max(...allCounts, 1);

      let hasCoords = false;
      for (const [district, { count, coords }] of Object.entries(districtGroups)) {
        const pos = coords ?? [14.5 + Math.random() * 2 - 1, 75.7 + Math.random() * 2 - 1];
        hasCoords = hasCoords || coords !== null;
        const radius = Math.min(8 + (count / maxCount) * 28, 36);
        const heat = Math.min(255, Math.round((count / maxCount) * 255));
        const color = `rgb(${heat},${Math.max(0, 200 - heat)},60)`;
        L.circleMarker(pos, {
          radius,
          fillColor: color,
          color: "#000",
          weight: 0.5,
          fillOpacity: 0.75,
        })
          .bindPopup(`<b>${district}</b><br>${count} cases`)
          .addTo(map);
      }

      // Fit map to markers if we have real coords
      if (hasCoords) {
        const validCoords = Object.values(districtGroups)
          .filter((v) => v.coords)
          .map((v) => v.coords as [number, number]);
        if (validCoords.length > 1) {
          map.fitBounds(validCoords, { padding: [40, 40] });
        }
      }
    });

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [rows]);

  return (
    <div
      className="mt-3 rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", width: "100%" }}
    >
      <div ref={mapRef} style={{ height: 340, width: "100%" }} />
    </div>
  );
}
