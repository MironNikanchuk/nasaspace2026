import type { Scenario, ScenarioPair } from "./types";

export const DEMO_START = "2027-01-07T00:00:00Z";
export const DEMO_END = "2027-01-14T00:00:00Z";
const ridge: Scenario = { site_id: "connecting-ridge", start_utc: DEMO_START, end_utc: DEMO_END };
export const DEFAULT_SCENARIOS: ScenarioPair = [
  { ...ridge, horizon: "terrain" },
  { ...ridge, site_id: "malapert-massif", horizon: "terrain" },
];

export const PRESETS: { id: string; label: string; description: string; scenarios: ScenarioPair }[] = [
  {
    id: "site-tradeoff",
    label: "Site trade-off",
    description: "Connecting Ridge and Malapert Massif, both at 0°.",
    scenarios: [ridge, { ...ridge, site_id: "malapert-massif" }],
  },
  {
    id: "terrain-impact",
    label: "Terrain impact",
    description: "Connecting Ridge with and without terrain.",
    scenarios: [ridge, { ...ridge, horizon: "terrain" }],
  },
  {
    id: "ridge-vs-rim",
    label: "Ridge vs. rim",
    description: "Connecting Ridge and Shackleton Rim with terrain.",
    scenarios: [{ ...ridge, horizon: "terrain" }, { ...ridge, site_id: "shackleton-rim", horizon: "terrain" }],
  },
];

function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== "object") return false;
  const s = value as Scenario;
  const site = typeof s.site_id === "string" && /^[a-z0-9-]{1,64}$/.test(s.site_id);
  const coords = s.coordinates && Number.isFinite(s.coordinates.latitude_deg)
    && Number.isFinite(s.coordinates.longitude_east_deg);
  return Boolean(site !== Boolean(coords)
    && typeof s.start_utc === "string" && Number.isFinite(Date.parse(s.start_utc))
    && typeof s.end_utc === "string" && Number.isFinite(Date.parse(s.end_utc))
    && (!s.visibility || ["disk_any", "disk_center", "disk_full"].includes(s.visibility))
    && (!s.horizon || s.horizon === "geometric" || s.horizon === "terrain"));
}

export function parsePair(value: unknown): ScenarioPair | undefined {
  if (Array.isArray(value) && value.length === 2 && value.every(isScenario)) {
    return [value[0], value[1]];
  }
}
