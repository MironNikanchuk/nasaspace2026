"use client";

import Link from "next/link";
import { LanguageSelect, useLanguage } from "./language";
import { Brand } from "./brand";
import { Icon } from "./icon";

const nav = [
  ["workspace", "/workspace", "view-grid", "Workspace"],
  ["atlas", "/atlas", "globe-alt", "Atlas"],
  ["saved", "/saved", "bookmark", "Saved"],
  ["account", "/account", "profile", "Account"],
];

export function Shell({ current, children }: {
  current: string; title: string; children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return <div className={current === "account" ? "app-shell app-shell-account" : "app-shell"}>
    <a className="skip-link" href="#main">{t("Skip to content")}</a>
    <header className="app-topbar">
      <div className="app-nav-inner">
        <Brand />
        <nav aria-label={t("Workspace navigation")}>{nav.map(([id, href, icon, label]) =>
          <Link key={id} className={current === id ? "nav-item active" : "nav-item"} href={href}
            aria-current={current === id ? "page" : undefined} aria-label={t(label)}>
            <Icon name={icon} width={16} /> <span>{t(label)}</span>
          </Link>)}</nav>
        <div className="app-utilities"><Link href="/#method" className="app-method">{t("Method")}</Link><LanguageSelect /></div>
      </div>
    </header>
    <main className="app-main" id="main">{children}</main>
  </div>;
}
