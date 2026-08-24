import type { Db } from "./db";

/**
 * Incident points — one marker per FIR, at the location the FIR carries.
 *
 * The district layer answers "which district is worst" by dropping a pin on the
 * district capital. That is a chart drawn on a map, not a map. `CaseMaster` has
 * had `latitude`/`longitude` all along; this reads them, so an officer can see
 * that the burglaries cluster on one arterial road rather than on Tumakuru city.
 *
 * Two things this module refuses to do quietly:
 *   - It never returns 20k markers. The fetch is capped and says so, and the
 *     client grids what it gets down to something a browser can paint.
 *   - It never drops a case for lacking coordinates without counting it. A
 *     blank location is itself a finding about the register, and hiding it
 *     would make the map look more complete than the data is.
 */

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** One case as the map needs it. `lat`/`lng` are nullable so a caller can hand raw rows straight to `thinPoints`. */
export interface IncidentPoint {
  id: number;
  lat: number | null;
  lng: number | null;
  crimeNo: string | null;
  crimeType: string | null;
  crimeGroup: string | null;
  district: string | null;
  station: string | null;
  date: string | null;
}

export interface IncidentPointQuery {
  bounds?: Bounds;
  /** Matches `CrimeHead.CrimeGroupName` exactly — the same vocabulary the rest of the app filters on. */
  crimeGroup?: string;
  /** Inclusive `CrimeRegisteredDate` window, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  cap?: number;
}

export interface IncidentPointResult {
  points: IncidentPoint[];
  /** Cases matching the filters that DO have usable coordinates — the "of M" in "showing N of M". */
  total: number;
  /** Cases matching the filters that do not. Reported, never folded into `total`. */
  missingCoords: number;
  cap: number;
  capped: boolean;
}

export const DEFAULT_POINT_CAP = 3000;
export const MAX_POINT_CAP = 10000;

// ---- Pure geometry (no DB, no Leaflet) -------------------------------------

/**
 * A "open in Google Maps" link for a point the officer clicked.
 *
 * Coordinates, never a place name: a text search on "{district} Karnataka"
 * lands on the district headquarters, which is rarely where the pin was.
 */
export function gmapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Inclusive on every edge: a case sitting exactly on the viewport border belongs to the viewport. */
export function withinBounds(lat: number, lng: number, b: Bounds): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/**
 * Web Mercator gives 256px per tile and 360° per world at zoom 0, so a cell of
 * `CLUSTER_PX` screen pixels is this many degrees wide. Sizing the grid in
 * screen space is what keeps the marker count roughly constant as you zoom —
 * the alternative, a fixed degree grid, is either useless statewide or useless
 * on a street.
 */
const CLUSTER_PX = 44;
export function cellDegForZoom(zoom: number): number {
  const z = Number.isFinite(zoom) ? Math.max(0, Math.min(20, zoom)) : 7;
  return (360 * CLUSTER_PX) / (256 * 2 ** z);
}

export interface IncidentCluster {
  lat: number;
  lng: number;
  /** How many incidents this marker stands for. 1 means it is a single case. */
  count: number;
  /** A real case from the cell — the one the drawer opens when `count` is 1. */
  sample: IncidentPoint;
}

export interface ThinResult {
  clusters: IncidentCluster[];
  /** Incidents actually represented on screen — the sum of the cluster weights. */
  shown: number;
  missingCoords: number;
  outOfBounds: number;
  /** Points past the cap, admitted by the filters but never drawn. */
  omitted: number;
}

export interface ThinOptions {
  cellDeg: number;
  /** Ceiling on admitted POINTS, not clusters — the guard against 20k markers. */
  cap: number;
  bounds?: Bounds;
}

/**
 * Collapse points sharing a grid cell into one weighted marker.
 *
 * Deliberately the whole thinning strategy in one pure function: the DOM budget
 * is a correctness property (20k markers freeze the tab), and a correctness
 * property should be testable without a browser or a database.
 */
export function thinPoints(points: readonly IncidentPoint[], opts: ThinOptions): ThinResult {
  const cellDeg = opts.cellDeg > 0 ? opts.cellDeg : cellDegForZoom(7);
  const cap = Math.max(0, Math.floor(opts.cap));

  let missingCoords = 0;
  let outOfBounds = 0;
  let omitted = 0;
  let admitted = 0;

  const cells = new Map<string, { latSum: number; lngSum: number; count: number; sample: IncidentPoint }>();

  for (const p of points) {
    const { lat, lng } = p;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      missingCoords++;
      continue;
    }
    if (opts.bounds && !withinBounds(lat, lng, opts.bounds)) {
      outOfBounds++;
      continue;
    }
    // Keep scanning past the cap rather than breaking — the tail still contains
    // blank-coordinate rows worth counting, and the caller reports those.
    if (admitted >= cap) {
      omitted++;
      continue;
    }
    admitted++;

    const key = `${Math.floor(lat / cellDeg)}:${Math.floor(lng / cellDeg)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.latSum += lat;
      cell.lngSum += lng;
      cell.count++;
    } else {
      cells.set(key, { latSum: lat, lngSum: lng, count: 1, sample: p });
    }
  }

  const clusters: IncidentCluster[] = [];
  for (const c of cells.values()) {
    // Centroid, not cell corner — a cluster should sit on its incidents.
    clusters.push({ lat: c.latSum / c.count, lng: c.lngSum / c.count, count: c.count, sample: c.sample });
  }

  return { clusters, shown: admitted, missingCoords, outOfBounds, omitted };
}

// ---- Query -----------------------------------------------------------------

/**
 * Fetch incident points for a scoped client. `db` comes from `scopedDb`, so a
 * district-posted SHO gets their district and nothing else — the RLS policy
 * does the filtering, not a WHERE clause we could forget to write.
 */
export async function fetchIncidentPoints(db: Db, q: IncidentPointQuery = {}): Promise<IncidentPointResult> {
  const cap = Math.max(1, Math.min(MAX_POINT_CAP, Math.floor(q.cap ?? DEFAULT_POINT_CAP)));

  const params: unknown[] = [];
  const where: string[] = [];
  const push = (v: unknown) => `$${params.push(v)}`;

  if (q.crimeGroup) where.push(`ch."CrimeGroupName" = ${push(q.crimeGroup)}`);
  if (q.from) where.push(`cm."CrimeRegisteredDate" >= ${push(q.from)}::date`);
  if (q.to) where.push(`cm."CrimeRegisteredDate" <= ${push(q.to)}::date`);

  // The bbox rides in a FILTER expression rather than the WHERE clause, so the
  // same statement can count the blank-coordinate rows the bbox cannot judge.
  let bboxSql = "TRUE";
  if (q.bounds) {
    const { south, west, north, east } = q.bounds;
    bboxSql =
      `cm."latitude" BETWEEN ${push(south)}::numeric AND ${push(north)}::numeric ` +
      `AND cm."longitude" BETWEEN ${push(west)}::numeric AND ${push(east)}::numeric`;
  }

  const joins = `
    FROM "CaseMaster" cm
    LEFT JOIN "CrimeHead"    ch  ON ch."CrimeHeadID"     = cm."CrimeMajorHeadID"
    LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
    LEFT JOIN "Unit"         u   ON u."UnitID"           = cm."PoliceStationID"
    LEFT JOIN "District"     d   ON d."DistrictID"       = u."DistrictID"
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;

  const hasCoords = `cm."latitude" IS NOT NULL AND cm."longitude" IS NOT NULL`;

  const counts = await db.$queryRawUnsafe<{ with_coords: bigint; without_coords: bigint }[]>(
    `SELECT COUNT(*) FILTER (WHERE ${hasCoords} AND (${bboxSql})) AS with_coords,
            COUNT(*) FILTER (WHERE NOT (${hasCoords}))            AS without_coords
     ${joins}`,
    ...params
  );

  // latitude/longitude are Prisma `Decimal?`. Cast in SQL: a Decimal object
  // would survive JSON.stringify as a string and reach Leaflet as NaN.
  const rows = await db.$queryRawUnsafe<IncidentPoint[]>(
    `SELECT cm."CaseMasterID"          AS id,
            cm."latitude"::float8      AS lat,
            cm."longitude"::float8     AS lng,
            cm."CrimeNo"               AS "crimeNo",
            csh."CrimeHeadName"        AS "crimeType",
            ch."CrimeGroupName"        AS "crimeGroup",
            d."DistrictName"           AS district,
            u."UnitName"               AS station,
            to_char(cm."CrimeRegisteredDate", 'YYYY-MM-DD') AS date
     ${joins}${where.length ? " AND" : " WHERE"} ${hasCoords} AND (${bboxSql})
     ORDER BY cm."CrimeRegisteredDate" DESC NULLS LAST, cm."CaseMasterID" DESC
     LIMIT ${push(cap)}`,
    ...params
  );

  const total = Number(counts[0]?.with_coords ?? 0);
  return {
    points: rows,
    total,
    missingCoords: Number(counts[0]?.without_coords ?? 0),
    cap,
    capped: total > rows.length,
  };
}
