"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { demoCatalog } from "@/lib/demo";
import { findWindows, loadOfflineSite, WINDOW_LENGTH } from "@/lib/offline-comparison";
import { numberLabel, percent, utcLabel } from "@/lib/format";
import { useLanguage } from "./language";

type Search = ReturnType<typeof findWindows>;
type Candidate = Search["daily"][number];

export function WindowSearch() {
  const { t } = useLanguage();
  const id = useId();
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<Search[]>();
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<"overlap" | "sunlight">("overlap");

  useEffect(() => {
    if (!searching || data) return;
    const request = new AbortController();
    Promise.all(demoCatalog.sites.map(async (entry) =>
      findWindows(entry, await loadOfflineSite(entry, request.signal))))
      .then((rows) => { if (!request.signal.aborted) setData(rows); })
      .catch(() => { if (!request.signal.aborted) setError(true); })
      .finally(() => { if (!request.signal.aborted) setSearching(false); });
    return () => request.abort();
  }, [searching, data]);

  const rank = data?.flatMap(({ candidates }) => candidates).sort((a, b) =>
    b.continuous - a.continuous || b.overlap - a.overlap || b.earth - a.earth || a.start - b.start);
  const best: Candidate[] = [];
  for (const candidate of rank ?? []) {
    if (best.length === 3) break;
    if (best.every((other) => other.site.id !== candidate.site.id || other.end <= candidate.start || candidate.end <= other.start)) best.push(candidate);
  }
  const fraction = (duration: number) => percent(duration / WINDOW_LENGTH * 100);
  return <section className="window-search panel" aria-labelledby={id} id="window-search">
    <h2 id={id}>{t("Find a 6.5-day window")}</h2>
    <p>{t("Rank by longest continuous sunlight, then by time with both Sun and Earth visible.")}</p>
    {!data && <button className="button button-primary" disabled={searching} type="button" onClick={() => {
      setError(false);
      setSearching(true);
    }}>{t(searching ? "Searching…" : "Search catalog")}</button>}
    {error && <p role="alert">{t("Could not load offline ephemerides.")}</p>}
    {data && <>
      <ol className="window-rank">
        {best.map((entry) => {
          const dates = { start_utc: new Date(entry.start).toISOString(), end_utc: new Date(entry.end).toISOString() };
          const site = { site_id: entry.site.id, horizon: entry.horizon, ...dates };
          return <li key={entry.site.id + entry.start}>
            <strong>{entry.site.name}</strong><small>{utcLabel(dates.start_utc)} / {utcLabel(dates.end_utc)}</small>
            <span>{t("Continuous Sun")} {numberLabel(entry.continuous / 3_600_000, 1)} h · {t("Overlap")} {fraction(entry.overlap)} · {t("Earth")} {fraction(entry.earth)}</span>
            <Link className="text-link" href={{ pathname: "/workspace", query: {
              scenario: JSON.stringify([site, { ...site, horizon: "geometric" }]),
            } }}>{t("Compare this window")}</Link>
          </li>;
        })}
      </ol>
      <div className="segmented" role="group" aria-label={t("Heatmap metric")}>
        <button type="button" aria-pressed={metric === "overlap"} onClick={() => setMetric("overlap")}>{t("Overlap")}</button>
        <button type="button" aria-pressed={metric === "sunlight"} onClick={() => setMetric("sunlight")}>{t("Sun")}</button>
      </div>
      <p>{t("Each cell covers 6.5 days from its UTC start date. Brighter means more visible time.")}</p>
      <div className="window-table" tabIndex={0} role="region" aria-label={t("Visibility by site and start date")}>
        <table>
          <thead><tr><th scope="col">{t("Landing site")}</th>
            {data[0].daily.map((entry) => <th scope="col" key={entry.start}>
              <span>{new Date(entry.start).toISOString().slice(0, 10)}</span></th>)}</tr></thead>
          <tbody>{data.map(({ daily }) => <tr key={daily[0].site.id}>
            <th scope="row">{daily[0].site.name}</th>
            {daily.map((entry) => <td key={entry.start} title={fraction(entry[metric])} style={{
              backgroundColor: `color-mix(in srgb, ${metric === "sunlight" ? "var(--sun)" : "var(--ink)"} ${6 + entry[metric] / WINDOW_LENGTH * 88}%, var(--bg))`,
            }}><span className="sr-only">{fraction(entry[metric])}</span></td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
