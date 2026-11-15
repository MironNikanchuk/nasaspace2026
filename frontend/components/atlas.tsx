"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "./language";
import { Icon } from "./icon";
import { demoCatalog } from "@/lib/demo";
import { DEFAULT_SCENARIOS, DEMO_START, DEMO_END } from "@/lib/presets";
import { loadOfflineSite, siteMetrics } from "@/lib/offline-comparison";
import { numberLabel, percent } from "@/lib/format";
import type { Catalog, CatalogSite, Coordinates, Scenario } from "@/lib/types";

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
  const [pair, setPair] = useState(DEFAULT_SCENARIOS);
  const [metrics, setMetrics] = useState<Record<string, number[]>>({});
  const [layer, setLayer] = useState<"sun" | "earth" | undefined>();
  const [coords, setCoords] = useState<Coordinates>();
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    fetch("/api/lunar/sites", { signal: request.signal }).then(async (response) => {
      if (!response.ok) return;
      const next: Catalog = await response.json();
      if (next.dataset.version === demoCatalog.dataset.version) setCatalog({ ...next, custom_coordinates_supported: true });
    }).catch(() => { /* The bundled atlas remains available without the API. */ });
    return () => request.abort();
  }, [initial]);

  useEffect(() => {
    const request = new AbortController();
    Promise.all(initial.sites.map(async (entry) => {
      const data = await loadOfflineSite(entry, request.signal);
      return [entry.site.id, siteMetrics(entry, data, DEMO_START, DEMO_END)] as const;
    })).then((entries) => {
      if (!request.signal.aborted) setMetrics(Object.fromEntries(entries));
    }).catch(() => { /* Coordinates and comparison links remain usable. */ });
    return () => request.abort();
  }, [initial]);

  function assign(index: 0 | 1, entry?: CatalogSite, coordinates?: Coordinates) {
    const scenario: Scenario = {
      start_utc: pair[index].start_utc, end_utc: pair[index].end_utc,
      ...(entry ? { site_id: entry.site.id } : { coordinates }),
      horizon: entry?.supported_horizons.includes("terrain") ? "terrain" : "geometric",
    };
    if (entry) setSelected(entry.site.id);
    setPair(index === 0 ? [scenario, pair[1]] : [pair[0], scenario]);
  }

  const layerValues = layer && Object.fromEntries(Object.entries(metrics).map(([site, values]) => [site, values[layer === "sun" ? 0 : 1]]));
  const coordinatesLabel = (coordinates: Coordinates) =>
    `${numberLabel(coordinates.latitude_deg, 3)}° · ${numberLabel(coordinates.longitude_east_deg, 3)}° E`;
  return <>
    <div className="workspace-heading"><h1>{t("Lunar atlas")}</h1></div>
    <div className="atlas-layout">
      <section className="atlas-globe" aria-label={t("Moon and landing site locations")}>
        <LunarGlobe sites={catalog.sites.map(({ site }) => site)} selectedId={selected} onSelect={setSelected}
          assignments={[pair[0].site_id, pair[1].site_id]}
          shading={layer && layerValues ? { body: layer, values: layerValues } : undefined} picking={picking}
          onPick={(coordinates) => { setCoords(coordinates); setPicking(false); }} />
        <div className="atlas-layer">
          <div className="segmented" role="group" aria-label={t("Map layer")}>
            <button type="button" aria-pressed={!layer} onClick={() => setLayer(undefined)}>{t("Terrain")}</button>
            <button type="button" aria-pressed={layer === "sun"} onClick={() => setLayer("sun")}>{t("Sun")}</button>
            <button type="button" aria-pressed={layer === "earth"} onClick={() => setLayer("earth")}>{t("Earth")}</button>
          </div>
          <small>{t("Visibility at catalog sites")} · {DEMO_START.slice(0, 10)} / {DEMO_END.slice(0, 10)} UTC</small>
        </div>
        <div className="atlas-pick">
          {catalog.custom_coordinates_supported && <button className="button button-small" type="button"
            aria-pressed={picking} onClick={() => setPicking(!picking)}>{t(picking ? "Cancel" : "Pick coordinates on the map")}</button>}
          {picking && <p role="status">{t("Click the map to select a point.")}</p>}
          {coords && <div className="action-row"><strong>{coordinatesLabel(coords)}</strong>
            <button className="button button-small" type="button" onClick={() => assign(0, undefined, coords)}>{t("Use as site A")}</button>
            <button className="button button-small" type="button" onClick={() => assign(1, undefined, coords)}>{t("Use as site B")}</button>
          </div>}
        </div>
      </section>
      <aside className="atlas-info">
        <h2>{t("Landing sites")}</h2>
        <ul className="atlas-list" aria-label={t("Select a landing site")}>{catalog.sites.map((entry) => {
          const { site } = entry;
          const values = metrics[site.id];
          return <li key={site.id}>
            <button className="atlas-site-name" type="button" aria-pressed={selected === site.id} onClick={() => setSelected(site.id)}>
              <span>{site.name}</span><small>{coordinatesLabel(site)}</small>
              {values && <small><span className="sun-reading">{t("Sun")} {percent(values[0])}</span>{" · "}
                <span className="earth-reading">{t("Earth")} {percent(values[1])}</span></small>}
            </button>
            <div className="atlas-assign">{(["A", "B"] as const).map((label, index) => <button key={label} type="button"
              className="button button-small" aria-label={`${t(index === 0 ? "Use as site A" : "Use as site B")} · ${site.name}`}
              aria-pressed={pair[index].site_id === site.id} onClick={() => assign(index === 0 ? 0 : 1, entry)}>{label}</button>)}</div>
          </li>;
        })}</ul>
        <div className="atlas-pair" aria-live="polite">{pair.map((scenario, index) => <div key={index}>
          <span className="scenario-letter">{index ? "B" : "A"}</span>
          <span>{scenario.coordinates ? coordinatesLabel(scenario.coordinates) :
            catalog.sites.find(({ site }) => site.id === scenario.site_id)?.site.name ?? scenario.site_id}</span>
        </div>)}</div>
        <Link className="button button-primary" href={{ pathname: "/workspace", query: { scenario: JSON.stringify(pair) } }}>
          {t("Open comparison")} <Icon name="arrow-right" width={16} />
        </Link>
      </aside>
    </div>
  </>;
}
