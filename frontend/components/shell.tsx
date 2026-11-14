"use client";

import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icon";
import { useSession } from "./session";

const nav = [
  ["workspace", "/workspace", "view-grid", "Comparison"],
  ["saved", "/saved", "bookmark", "Saved scenarios"],
  ["atlas", "/atlas", "globe-alt", "3D atlas"],
  ["account", "/account", "profile", "Account"],
];

export function Shell({ current, title, children }: {
  current: string; title: string; children: React.ReactNode;
}) {
  const { user } = useSession();
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand small /></div>
      <nav aria-label="Workspace navigation">{nav.map(([id, href, icon, label]) =>
        <Link key={id} className={current === id ? "nav-item active" : "nav-item"} href={href}
          aria-current={current === id ? "page" : undefined}><Icon name={icon} /> <span>{label}</span></Link>)}</nav>
      <Link href="/#method" className="nav-item sidebar-end"><Icon name="file-document" /><span>Method & sources</span></Link>
    </aside>
    <div className="app-content">
      <header className="app-topbar">
        <div><Link href="/">LunaWindow</Link><span className="top-divider">/</span><strong>{title}</strong></div>
        <Link className="button button-small" href="/account"><Icon name="profile" width={16} />{user ? "Account" : "Sign in"}</Link>
      </header>
      <main className="app-main" id="main">{children}</main>
    </div>
  </div>;
}
