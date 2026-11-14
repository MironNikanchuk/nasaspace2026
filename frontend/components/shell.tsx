"use client";

import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icon";

const nav = [
  ["workspace", "/workspace", "view-grid", "Compare"],
  ["atlas", "/atlas", "globe-alt", "Atlas"],
  ["saved", "/saved", "bookmark", "Saved"],
  ["account", "/account", "profile", "Account"],
];

export function Shell({ current, children }: {
  current: string; title: string; children: React.ReactNode;
}) {
  return <div className={current === "account" ? "app-shell app-shell-account" : "app-shell"}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-topbar">
      <div className="app-nav-inner">
        <Brand />
        <nav aria-label="Workspace navigation">{nav.map(([id, href, icon, label]) =>
          <Link key={id} className={current === id ? "nav-item active" : "nav-item"} href={href}
            aria-current={current === id ? "page" : undefined}>
            <Icon name={icon} width={16} /> <span>{label}</span>
          </Link>)}</nav>
        <Link href="/#method" className="app-method">Method</Link>
      </div>
    </header>
    <main className="app-main" id="main">{children}</main>
  </div>;
}
