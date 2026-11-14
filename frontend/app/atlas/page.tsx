import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { Atlas } from "@/components/atlas";
import { demoCatalog } from "@/lib/demo";
export const metadata: Metadata = { title: "Lunar atlas" };
export default function AtlasPage() {
  return <Shell current="atlas" title="Lunar atlas"><Atlas initial={demoCatalog} /></Shell>;
}
