import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { Atlas } from "@/components/atlas";
export const metadata: Metadata = { title: "3D atlas" };
export default function AtlasPage() {
  return <Shell current="atlas" title="3D atlas"><Atlas /></Shell>;
}
