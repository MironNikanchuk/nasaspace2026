"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteSaved, getSaved } from "@/lib/saved";
import type { SavedScenario } from "@/lib/types";
import { Icon } from "./icon";
import { useSession } from "./session";

export function SavedList() {
  const { user, ready } = useSession();
  const [saved, setSaved] = useState<SavedScenario[]>();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string>();
  const userId = user?.id;
  useEffect(() => {
    if (!ready) return;
    let current = true;
    setSaved(undefined);
    setError("");
    getSaved(userId).then((rows) => { if (current) setSaved(rows); }).catch(() => {
      if (current) setError("Could not load saved scenarios.");
    });
    return () => { current = false; };
  }, [ready, userId]);

  return <>
    <div className="workspace-heading"><div><h1>Saved scenarios</h1><p>{user
      ? "Comparisons saved to your account."
      : <>Comparisons saved on this device. <Link href="/account">Sign in</Link> to save new ones to your account.</>}</p></div>
      <Link className="button button-primary" href="/workspace">New comparison <Icon name="arrow-right" /></Link></div>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {!saved && !error && <p className="feedback" role="status">Loading saved scenarios…</p>}
    {saved?.length === 0 && <section className="panel empty"><Icon name="bookmark" width={25} /><h2>No saved scenarios</h2>
      <p>Run a comparison and select Save to keep it here.</p><Link className="button" href="/workspace">Open comparison</Link></section>}
    {saved && saved.length > 0 && <ul className="panel saved-list">{saved.map((record) =>
      <li key={record.id}><div><strong>{record.title}</strong><p>{new Date(record.created_at).toLocaleDateString("en-GB", { timeZone: "UTC", dateStyle: "medium" })}</p></div>
        <div><Link className="button button-small" href={{ pathname: "/workspace", query: { scenario: JSON.stringify(record.scenarios) } }}>Open</Link>
          <button className="button button-small" disabled={Boolean(deleting)} onClick={async () => {
            setDeleting(record.id); setError("");
            try { await deleteSaved(record.id, userId); setSaved((rows) => rows?.filter((row) => row.id !== record.id)); }
            catch { setError("Could not delete this scenario."); }
            finally { setDeleting(undefined); }
          }} aria-label={`Delete ${record.title}`}><Icon name="trash" />{deleting === record.id ? "Deleting…" : "Delete"}</button></div>
      </li>)}</ul>}
  </>;
}
