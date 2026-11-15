"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "./language";
import { Icon } from "./icon";
import { PRESETS } from "@/lib/presets";
import type { Catalog, Scenario } from "@/lib/types";

const LunarGlobe = dynamic(() => import("./mission-scene").then((module) => module.LunarGlobe), {
  ssr: false,
  loading: function Loading() {
    const { t } = useLanguage();
    return <div className="scene-placeholder" role="status">{t("Preparing the lunar globe…")}</div>;
  },
});

export function Atlas({ initial }: { initial: Catalog }) {
  const { t } = useLanguage();
  const [catalog, setCatalog] = useState(initial);
  const [selected, setSelected] = useState(initial.sites[0].site.id);
  const [pair, setPair] = useState(PRESETS[0].scenarios);
  const active = catalog.sites.find((entry) => entry.site.id === selected) ?? catalog.sites[0];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/lunar/sites", { signal: controller.signal }).then((response) => {
      if (response.ok) return response.json();
    }).then((next: Catalog | undefined) => {
      if (next?.sites.length) setCatalog(next);
    }).catch(() => {
      // The catalog bundled with the atlas remains available offline.
    });
    return () => controller.abort();
  }, []);

  function assign(index: 0 | 1) {
    const scenario: Scenario = { ...pair[index], site_id: active.site.id,
      horizon: active.supported_horizons.includes("terrain") ? pair[index].horizon : "geometric" };
    setPair(index === 0 ? [scenario, pair[1]] : [pair[0], scenario]);
  }

  return <>
    <div className="workspace-heading"><div>
      <h1>{t("Lunar atlas")}</h1>
    </div></div>
    <div className="atlas-layout">
      <section className="atlas-globe" aria-label={t("Moon and landing site locations")}>
        <LunarGlobe sites={catalog.sites.map(({ site }) => site)} selectedId={active.site.id} onSelect={setSelected}
          assignments={[pair[0].site_id, pair[1].site_id]} />
      </section>
      <aside className="atlas-info">
        <h2>{t("Landing sites")}</h2>
        <div className="atlas-site-list" aria-label={t("Select a landing site")}>{catalog.sites.map((entry) => {
          const { site } = entry;
          return <button key={site.id} aria-pressed={active.site.id === site.id} type="button" onClick={() => setSelected(site.id)}>
            <span>{site.name}</span>{active.site.id === site.id && <small>{site.latitude_deg.toFixed(3)}° · {site.longitude_east_deg.toFixed(3)}° E</small>}
          </button>;
        })}</div>
        <div className="action-row">
          <button className="button button-small" type="button" onClick={() => assign(0)}>{t("Use as site A")}</button>
          <button className="button button-small" type="button" onClick={() => assign(1)}>{t("Use as site B")}</button>
        </div>
        <div className="atlas-pair" aria-live="polite">{pair.map((scenario, index) => <div key={index}>
          <span className="scenario-letter">{index ? "B" : "A"}</span>
          <span>{catalog.sites.find(({ site }) => site.id === scenario.site_id)?.site.name ?? scenario.site_id}</span>
        </div>)}</div>
        <Link className="button button-primary" href={{ pathname: "/workspace", query: { scenario: JSON.stringify(pair) } }}>
          {t("Open comparison")} <Icon name="arrow-right" width={16} />
        </Link>
      </aside>
    </div>
  </>;
}
