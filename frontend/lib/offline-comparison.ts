import terrain from "@/data/terrain.json";
import { demoCatalog } from "./demo";
import { DAY_MS } from "./format";
import type { CatalogSite, Comparison, DiskVisibility, Result, Scenario, ScenarioPair, Window } from "./types";

type Interval = [start: number, end: number];
type Rows = [sunAz: number, sunEl: number, earthAz: number, earthEl: number][];
export type OfflineSite = {
  version: string;
  rows: Rows;
  results: Record<string, { model: Result["model"]; windows: [Interval[], Interval[], Interval[]] }>;
};

const profiles = terrain.sites as Record<string, { elevations_deg: number[] }>;
const cache = new Map<string, OfflineSite>();
export const offlineSiteError = "Offline calculations are available for catalog sites only.";

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
  const step = demoCatalog.dataset.step_minutes * 60_000;
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
    return { time_utc: iso(base + time), sun: position(0, 0.2666), earth: position(2, 0.95) };
  });
  const windows = (times: Interval[]): Window[] => times.map(([a, b]) => ({ start_utc: iso(base + a), end_utc: iso(base + b) }));
  return {
    site, start_utc: iso(base + start), end_utc: iso(base + end), model: record.model,
    ephemeris: demoCatalog.dataset.ephemeris, samples,
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
  const scenarios = await Promise.all(pair.map(async (scenario) => {
    const entry = demoCatalog.sites.find(({ site }) => site.id === scenario.site_id);
    if (!entry) throw new Error(offlineSiteError);
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
