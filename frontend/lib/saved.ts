import { supabase } from "./supabase";
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

export async function saveScenario(title: string, scenarios: ScenarioPair, userId?: string) {
  if (userId && supabase) {
    const { error } = await supabase.from("saved_scenarios").insert({
      user_id: userId, title, scenarios,
    });
    if (error) throw error;
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify([
    { id: crypto.randomUUID(), title, scenarios, created_at: new Date().toISOString() },
    ...loadLocal(),
  ]));
}

export async function getSaved(userId?: string): Promise<SavedScenario[]> {
  if (!userId || !supabase) return loadLocal();
  const { data, error } = await supabase.from("saved_scenarios")
    .select("id,title,scenarios,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data.filter((row) => parsePair(row.scenarios));
}

export async function deleteSaved(id: string, userId?: string) {
  if (userId && supabase) {
    const { error } = await supabase.from("saved_scenarios").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(loadLocal().filter((row) => row.id !== id)));
}
