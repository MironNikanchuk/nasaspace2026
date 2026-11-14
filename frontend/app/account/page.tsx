import type { Metadata } from "next";
import { Account } from "@/components/account";
import { Shell } from "@/components/shell";
export const metadata: Metadata = { title: "Account" };
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <Shell current="account" title="Account"><Account initialMode={mode === "signup" ? "sign-up" : "sign-in"} /></Shell>;
}
