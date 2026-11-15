"use client";

import { useLanguage } from "./language";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteSaved, loadLocal } from "@/lib/saved";
import type { SavedScenario } from "@/lib/types";
import { Icon } from "./icon";
import { PRESETS } from "@/lib/presets";

export function SavedList() {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<SavedScenario[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    setSaved(loadLocal());
  }, []);

  return <>
    <div className="workspace-heading"><div><h1>{t("Saved scenarios")}</h1><p>{t("Comparisons saved in this browser.")}</p></div>
      <Link className="button button-primary" href="/workspace">{t("New comparison")} <Icon name="arrow-right" /></Link></div>
    {error && <p className="feedback error" role="alert">{t(error)}</p>}
    {!saved && !error && <p className="feedback" role="status">{t("Loading saved scenarios…")}</p>}
    {saved?.length === 0 && <section className="panel empty"><Icon name="bookmark" width={25} /><h2>{t("No saved scenarios")}</h2>
      <p>{t("Run a comparison and save it to keep it here.")}</p>
      <div className="saved-presets">{PRESETS.map(({ id, label }) => <Link className="text-link" key={id} href={`/workspace?preset=${id}`}>
        {t(label)} <Icon name="arrow-right" width={16} /></Link>)}</div></section>}
    {saved && saved.length > 0 && <ul className="panel saved-list">{saved.map((record) =>
      <li key={record.id}><div><strong>{record.title}</strong><p>{record.scenarios[0].start_utc.slice(0,10)} – {record.scenarios[0].end_utc.slice(0,10)} UTC</p></div>
        <div><Link className="button button-small" href={{ pathname: "/workspace", query: { scenario: JSON.stringify(record.scenarios) } }}>{t("Open")}</Link>
          <button className="button button-small" onClick={() => {
            setError("");
            try {
              deleteSaved(record.id);
              setSaved(loadLocal());
            } catch {
              setError("Could not delete this scenario.");
            }
          }} aria-label={`${t("Delete")} ${record.title}`}><Icon name="trash" />{t("Delete")}</button></div>
      </li>)}</ul>}
  </>;
}
