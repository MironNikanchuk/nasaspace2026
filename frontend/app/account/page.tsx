import type { Metadata } from "next";
import { Account } from "@/components/account";
import { Shell } from "@/components/shell";
export const metadata: Metadata = { title: "Account" };
export default function AccountPage() {
  return <Shell current="account" title="Account"><Account /></Shell>;
}
