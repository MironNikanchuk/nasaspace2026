import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { SavedList } from "@/components/saved-list";
export const metadata: Metadata = { title: "Saved scenarios" };
export default function SavedPage() {
  return <Shell current="saved" title="Saved scenarios"><SavedList /></Shell>;
}
