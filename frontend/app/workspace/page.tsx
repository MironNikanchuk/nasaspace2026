import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { WorkspaceEntry } from "@/components/workspace-entry";
import { Workspace } from "@/components/workspace";
import { PRESETS, parsePair } from "@/lib/presets";

export const metadata: Metadata = { title: "Comparison" };

export default async function WorkspacePage({ searchParams }: {
  searchParams: Promise<{ preset?: string; scenario?: string }>;
}) {
  const query = await searchParams;
  let initial = PRESETS.find((preset) => preset.id === query.preset)?.scenarios ?? PRESETS[0].scenarios;
  if (query.scenario && query.scenario.length < 2048) {
    try { initial = parsePair(JSON.parse(query.scenario)) ?? initial; } catch { /* invalid link */ }
  }
  return <Shell current="workspace" title="Comparison"><WorkspaceEntry /><Workspace key={JSON.stringify(initial)} initial={initial} /></Shell>;
}
