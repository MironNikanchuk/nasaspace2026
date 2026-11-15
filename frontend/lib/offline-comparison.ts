import terrain from "@/data/terrain.json";
import { demoCatalog } from "./demo";
import { DAY_MS } from "./format";
import type { CatalogSite, Comparison, Coordinates, DiskVisibility, Result, Scenario, ScenarioPair, Window } from "./types";

type Interval = [start: number, end: number];
type Rows = [sunAz: number, sunEl: number, earthAz: number, earthEl: number][];
export type OfflineSite = {
  version: string;
  ephemeris?: string;
  rows: Rows;
  results: Record<string, { model: Result["model"]; windows: [Interval[], Interval[], Interval[]] }>;
};

const profiles = terrain.sites as Record<string, { elevations_deg: number[] }>;
const cache = new Map<string, OfflineSite>();
const step = demoCatalog.dataset.step_minutes * 60_000;

export async function loadOfflineSite(entry: CatalogSite, signal: AbortSignal): Promise<OfflineSite> {
  const id = entry.site.id;
  const cached = cache.get(id);
  if (cached) return cached;
  const response = await fetch(`/ephemeris/${encodeURIComponent(id)}.json?v=${demoCatalog.dataset.version}`, { signal });
  if (!response.ok) throw new Error("Could not load offline ephemerides.");
  const data: OfflineSite = await response.json();
  if (data.version !== demoCatalog.dataset.version) throw new Error("Could not load offline ephemerides.");
  cache.set(id, data);
  return data;
}

function clip(windows: Interval[], start: number, end: number): Interval[] {
  return windows.flatMap(([from, to]): Interval[] => {
    const a = Math.max(from, start), b = Math.min(to, end);
    return a < b ? [[a, b]] : [];
  });
}

function span(windows: Interval[]) {
  return windows.reduce((sum, [a, b]) => sum + b - a, 0);
}

export function longestWindow(windows: Interval[]) {
  return Math.max(0, ...windows.map(([a, b]) => b - a));
}

function outage(windows: Interval[], start: number, stop: number) {
  let longest = 0;
  for (const [from, to] of windows) {
    longest = Math.max(longest, from - start);
    start = to;
  }
  return Math.max(longest, stop - start);
}

const iso = (ms: number) => new Date(ms).toISOString();
const round = (value: number) => Math.round(value * 1000) / 1000;
const wrap = (angle: number) => ((angle % 360) + 360) % 360;
const fraction = (mode: DiskVisibility) => mode === "disk_any" ? 1 : mode === "disk_full" ? -1 : 0;
const radii = [0.2666, 0.95] as const;

type Vector = [number, number, number];
type BrowserVectors = { start_utc: string; rows: [...Vector, ...Vector][] };
let cachedVectors: BrowserVectors | undefined;
const customEphemeris = "NAIF SPICE DE440 (browser)";

async function loadBrowserVectors(signal: AbortSignal) {
  if (cachedVectors) return cachedVectors;
  const response = await fetch("/ephemeris/moon-vectors-v1.json", { signal });
  if (!response.ok) throw new Error("Could not load offline ephemerides.");
  const data: BrowserVectors = await response.json();
  const { start_utc, end_utc } = demoCatalog.sites[0];
  if (Date.parse(data.start_utc) !== Date.parse(start_utc)
    || data.rows.length !== (Date.parse(end_utc) - Date.parse(start_utc)) / step + 1) {
    throw new Error("Could not load offline ephemerides.");
  }
  return (cachedVectors = data);
}

export function projectBrowserVectors(data: BrowserVectors, coordinates: Coordinates): Rows {
  const phi = coordinates.latitude_deg * Math.PI / 180, lambda = coordinates.longitude_east_deg * Math.PI / 180;
  const sp = Math.sin(phi), cp = Math.cos(phi), sl = Math.sin(lambda), cl = Math.cos(lambda);
  const degrees = 180 / Math.PI;
  const up: Vector = [cp * cl, cp * sl, sp];
  const north: Vector = [-sp * cl, -sp * sl, cp];
  const east: Vector = [-sl, cl, 0];
  const dot = ([x, y, z]: Vector, [a, b, c]: Vector) => x * a + y * b + z * c;
  function project(vector: Vector): [number, number] {
    // Subtract the surface observer in the up component. Light-time and stellar
    // aberration corrections are applied at the lunar center in these vectors.
    const e = dot(east, vector), n = dot(north, vector), u = dot(up, vector) - 1737.4;
    return [wrap(Math.atan2(e, n) * degrees), Math.atan2(u, Math.hypot(e, n)) * degrees];
  }
  return data.rows.map(([sx, sy, sz, ex, ey, ez]) => [...project([sx, sy, sz]), ...project([ex, ey, ez])]);
}

function geometricWindows(rows: Rows, column: 1 | 3, offset: number): Interval[] {
  const windows: Interval[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const left = rows[i][column] + offset, right = rows[i + 1][column] + offset;
    if (left <= 0 && right <= 0) continue;
    const cross = left > 0 && right > 0 ? 0 : -left / (right - left);
    const start = (i + (left <= 0 ? cross : 0)) * step;
    const end = (i + (right <= 0 ? cross : 1)) * step;
    if (start >= end) continue;
    const last = windows.at(-1);
    if (last && last[1] === start) last[1] = end;
    else windows.push([start, end]);
  }
  return windows;
}

export function evaluateOffline(entry: CatalogSite, data: OfflineSite, scenario: Scenario): Result {
  const { site } = entry;
  const base = Date.parse(entry.start_utc);
  const start = Date.parse(scenario.start_utc) - base;
  const end = Date.parse(scenario.end_utc) - base;
  const duration = end - start;
  if (!(start >= 0 && duration > 0 && duration <= demoCatalog.max_duration_days * DAY_MS
    && end <= Date.parse(entry.end_utc) - base)) {
    throw new Error("Choose dates within the available range (up to 30 days).");
  }
  const horizon = scenario.horizon ?? "geometric";
  const mode = scenario.visibility ?? "disk_center";
  const record = data.results[`${horizon}:${mode}`];
  if (!record) throw new Error("Terrain is unavailable for this site.");
  const [sun, earth, both] = record.windows.map((rows) => clip(rows, start, end));
  const profile = horizon === "terrain" ? profiles[site.id].elevations_deg : undefined;
  const offsets = [start];
  for (let next = (Math.floor(start / step) + 1) * step; next < end; next += step) offsets.push(next);
  offsets.push(end);
  const samples = offsets.map((time) => {
    const index = Math.floor(time / step);
    const f = time / step - index;
    const row = data.rows[index], next = data.rows[index + 1] ?? row;
    function position(column: 0 | 2, radius: number) {
      const delta = wrap(next[column] - row[column] + 180) - 180;
      const azimuth = wrap(row[column] + f * delta);
      const height = row[column + 1] + f * (next[column + 1] - row[column + 1]);
      let limit = 0;
      if (profile) {
        const location = azimuth / 360 * profile.length;
        const i = Math.floor(location);
        limit = profile[i] + (location - i) * (profile[(i + 1) % profile.length] - profile[i]);
      }
      return { azimuth_deg: azimuth, elevation_deg: height, horizon_elevation_deg: limit,
        above_horizon: height + fraction(mode) * radius > limit };
    }
    return { time_utc: iso(base + time), sun: position(0, radii[0]), earth: position(2, radii[1]) };
  });
  const windows = (times: Interval[]): Window[] => times.map(([a, b]) => ({ start_utc: iso(base + a), end_utc: iso(base + b) }));
  return {
    site, start_utc: iso(base + start), end_utc: iso(base + end), model: record.model,
    ephemeris: data.ephemeris ?? demoCatalog.dataset.ephemeris, samples,
    windows: { sun: windows(sun), earth: windows(earth), both: windows(both) },
    summary: {
      sun_visible_percent: round(100 * span(sun) / duration),
      earth_visible_percent: round(100 * span(earth) / duration),
      both_visible_percent: round(100 * span(both) / duration),
      longest_sun_window_hours: round(longestWindow(sun) / 3_600_000),
      longest_sun_outage_hours: round(outage(sun, start, end) / 3_600_000),
      longest_earth_outage_hours: round(outage(earth, start, end) / 3_600_000),
    },
  };
}

export async function offlineComparison(pair: ScenarioPair, signal: AbortSignal): Promise<Comparison> {
  const vectors = pair.some((scenario) => scenario.coordinates) ? await loadBrowserVectors(signal) : undefined;
  const scenarios = await Promise.all(pair.map(async (scenario) => {
    if (scenario.coordinates && vectors) {
      const { latitude_deg, longitude_east_deg } = scenario.coordinates;
      if (!(latitude_deg > -90 && latitude_deg <= -80 && longitude_east_deg >= 0 && longitude_east_deg < 360)) {
        throw new Error("Choose valid south-pole coordinates.");
      }
      if (scenario.horizon === "terrain") throw new Error("Terrain is unavailable for this site.");
      const { start_utc, end_utc } = demoCatalog.sites[0];
      const site = { ...scenario.coordinates, id: "custom", name: "Custom coordinates",
        observer_altitude_km: 0, source_site_id: null };
      const entry: CatalogSite = { site, start_utc, end_utc, supported_horizons: ["geometric"] };
      const rows = projectBrowserVectors(vectors, scenario.coordinates);
      const visibility = scenario.visibility ?? "disk_center";
      const sun = geometricWindows(rows, 1, fraction(visibility) * radii[0]);
      const earth = geometricWindows(rows, 3, fraction(visibility) * radii[1]);
      const both = earth.flatMap(([start, end]) => clip(sun, start, end));
      return evaluateOffline(entry, { version: demoCatalog.dataset.version, ephemeris: customEphemeris, rows,
        results: { [`geometric:${visibility}`]: { model: { horizon: "geometric", visibility }, windows: [sun, earth, both] } },
      }, scenario);
    }
    const entry = demoCatalog.sites.find(({ site }) => site.id === scenario.site_id);
    if (!entry) throw new Error("Unknown site ID");
    return evaluateOffline(entry, await loadOfflineSite(entry, signal), scenario);
  }));
  return { demo_only: true, dataset: demoCatalog.dataset, scenarios: [scenarios[0], scenarios[1]] };
}

export function siteMetrics(entry: CatalogSite, data: OfflineSite, start: string, end: string) {
  const base = Date.parse(entry.start_utc);
  const from = Date.parse(start) - base, to = Date.parse(end) - base;
  const model = entry.supported_horizons.includes("terrain") ? "terrain" : "geometric";
  const [sun, earth] = data.results[`${model}:disk_center`].windows;
  return [sun, earth].map((windows) => round(span(clip(windows, from, to)) / (to - from) * 100));
}

export const WINDOW_LENGTH = 6.5 * DAY_MS;
export function findWindows(entry: CatalogSite, data: OfflineSite) {
  const horizon = entry.supported_horizons.includes("terrain") ? "terrain" : "geometric";
  const [sun, earth, both] = data.results[`${horizon}:disk_center`].windows;
  const base = Date.parse(entry.start_utc);
  const last = Date.parse(entry.end_utc) - base - WINDOW_LENGTH;
  function evaluate(start: number) {
    const end = start + WINDOW_LENGTH;
    return {
      site: entry.site, horizon, start: base + start, end: base + end,
      continuous: longestWindow(clip(sun, start, end)),
      sunlight: span(clip(sun, start, end)),
      overlap: span(clip(both, start, end)),
      earth: span(clip(earth, start, end)),
    };
  }
  const daily = Array.from({ length: Math.floor(last / DAY_MS) + 1 }, (_, i) => evaluate(i * DAY_MS));
  // The score is piecewise linear between these changes in the window's contents.
  const edges = [...sun, ...earth, ...both].flatMap(([a, b]) => [a, b, a - WINDOW_LENGTH, b - WINDOW_LENGTH]);
  const starts = [...new Set([0, last, ...edges.filter((start) => start > 0 && start < last)])];
  return { daily, candidates: starts.map(evaluate) };
}
