import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { Workspace } from "@/components/workspace";
import { DEFAULT_SCENARIOS, PRESETS, parsePair } from "@/lib/presets";

export const metadata: Metadata = { title: "Comparison" };

export default async function WorkspacePage({ searchParams }: {
  searchParams: Promise<{ preset?: string; scenario?: string }>;
}) {
  const query = await searchParams;
  let initial = PRESETS.find((preset) => preset.id === query.preset)?.scenarios ?? DEFAULT_SCENARIOS;
  if (query.scenario && query.scenario.length < 2048) {
    try { initial = parsePair(JSON.parse(query.scenario)) ?? initial; } catch { /* invalid link */ }
  }
  return <Shell current="workspace" title="Comparison"><Workspace key={JSON.stringify(initial)} initial={initial} /></Shell>;
}
