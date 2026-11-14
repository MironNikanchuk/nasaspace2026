"use client";

import Link from "next/link";
import { useLanguage } from "./language";
import { useSession } from "./session";

export function WorkspaceEntry() {
  const { t } = useLanguage();
  const { user, ready } = useSession();
  return ready && !user ? <p className="workspace-entry">
    {t("Sign in to save and sync comparisons.")} <Link className="text-link" href="/account">{t("Sign in")}</Link>
    <Link className="text-link" href="/account?mode=signup">{t("Create account")}</Link>
  </p> : null;
}
