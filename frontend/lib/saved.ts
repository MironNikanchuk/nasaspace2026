import { parsePair } from "./presets";
import type { SavedScenario, ScenarioPair } from "./types";

const storageKey = "lunawindow-scenarios-v1";

export function loadLocal(): SavedScenario[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string"
      && typeof item.title === "string" && typeof item.created_at === "string"
      && parsePair(item.scenarios));
  } catch {
    return [];
  }
}

export function saveScenario(title: string, scenarios: ScenarioPair) {
  localStorage.setItem(storageKey, JSON.stringify([
    { id: crypto.randomUUID(), title, scenarios, created_at: new Date().toISOString() },
    ...loadLocal(),
  ]));
}

export function deleteSaved(id: string) {
  localStorage.setItem(storageKey, JSON.stringify(loadLocal().filter((row) => row.id !== id)));
}
