import snapshot from "@/data/demo.json";
import { DEMO_END, DEMO_START } from "./presets";
import type { Catalog, Comparison, Result, ScenarioPair } from "./types";

export const demoCatalog: Catalog = {
  ...(snapshot.catalog as Catalog), demo_only: true, custom_coordinates_supported: true,
};
const results = snapshot.results as Record<string, Result>;

export function demoComparison(pair: ScenarioPair): Comparison | undefined {
  const scenarios = pair.map((scenario) => {
    if (!scenario.site_id || (scenario.visibility && scenario.visibility !== "disk_center") || Date.parse(scenario.start_utc) !== Date.parse(DEMO_START)
      || Date.parse(scenario.end_utc) !== Date.parse(DEMO_END)) return;
    return results[`${scenario.site_id}:${scenario.horizon ?? "geometric"}`];
  });
  if (scenarios[0] && scenarios[1]) {
    return { demo_only: true, dataset: demoCatalog.dataset, scenarios: [scenarios[0], scenarios[1]] };
  }
}
