"use client";

import { useLanguage } from "./language";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { useSession } from "./session";
import { ElevationChart, Timeline, elevationScale } from "./charts";
import { DAY_MS, percent as pct, utcLabel } from "@/lib/format";
import { demoCatalog } from "@/lib/demo";
import { offlineComparison } from "@/lib/offline-comparison";
import { WindowSearch } from "./window-search";
import { VisibilityOverview } from "./visibility-overview";
import { PRESETS, parsePair } from "@/lib/presets";
import { saveScenario } from "@/lib/saved";
import type { Translate } from "@/lib/locale";
import type { Catalog, Comparison, DiskVisibility, Horizon, Result, Scenario, ScenarioPair } from "@/lib/types";

const MissionScene = dynamic(() => import("./mission-scene").then((module) => module.MissionScene), {
  ssr: false,
  loading: function Loading() {
    const { t } = useLanguage();
    return <div className="scene-placeholder" role="status">{t("Preparing the 3D horizon…")}</div>;
  },
});

const diskLabels: Record<DiskVisibility, string> = {
  disk_any: "Any part of the disk",
  disk_center: "Center of the disk",
  disk_full: "Entire disk",
};

function rangeValid(scenario: Scenario, catalog: Catalog) {
  const entry = catalog.sites.find(({ site }) => site.id === scenario.site_id) ?? catalog.sites[0];
  const start = Date.parse(scenario.start_utc), end = Date.parse(scenario.end_utc);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  return entry && iso.test(scenario.start_utc) && iso.test(scenario.end_utc) && start >= Date.parse(entry.start_utc) && end <= Date.parse(entry.end_utc)
    && end > start && end - start <= catalog.max_duration_days * DAY_MS
    && (!scenario.coordinates || (scenario.coordinates.latitude_deg > -90 && scenario.coordinates.latitude_deg <= -80
      && scenario.coordinates.longitude_east_deg >= 0 && scenario.coordinates.longitude_east_deg < 360));
}

function changeScenarioSite(scenario: Scenario, id: string, catalog: Catalog): Scenario {
  if (id === "custom") return { ...scenario, site_id: undefined, horizon: "geometric",
    coordinates: { latitude_deg: -89.4632, longitude_east_deg: 222.51 } };
  const allowed = catalog.sites.find((entry) => entry.site.id === id)?.supported_horizons;
  return { ...scenario, site_id: id, coordinates: undefined,
    horizon: allowed?.includes("terrain") ? "terrain" : "geometric" };
}

async function compare(pair: ScenarioPair, signal: AbortSignal): Promise<Comparison> {
  let response: Response;
  try {
    response = await fetch("/api/lunar/compare", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarios: pair }), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return offlineComparison(pair, signal);
  }
  if (response.status >= 500) return offlineComparison(pair, signal);
  const answer = await response.json();
  if (answer.demo_only || (response.status === 422 && Array.isArray(answer.detail)
    && pair.every((scenario) => scenario.site_id)
    && answer.detail.some((issue: { type: string }) =>
      ["unknown_site", "terrain_unavailable", "extra_forbidden"].includes(issue.type)))) {
    return offlineComparison(pair, signal);
  }
  if (!response.ok) {
    const message = Array.isArray(answer.detail)
      ? answer.detail.map((part: { msg: string }) => part.msg).join(" · ")
      : answer.detail;
    throw new Error(message || "Could not compare the selected scenarios");
  }
  if (answer.dataset.version !== demoCatalog.dataset.version && pair.every((scenario) => scenario.site_id)) {
    return offlineComparison(pair, signal);
  }
  return answer;
}

function DateFields({ scenario, catalog, onChange }: {
  scenario: Scenario; catalog: Catalog; onChange: (scenario: Scenario) => void;
}) {
  const { t } = useLanguage();
  const entry = catalog.sites.find(({ site }) => site.id === scenario.site_id) ?? catalog.sites[0];
  const bounds = [entry.start_utc.slice(0, 10), entry.end_utc.slice(0, 10)];
  function duration(days: number) {
    const start = Math.max(Date.parse(entry.start_utc),
      Math.min(Date.parse(scenario.start_utc) || Date.parse(entry.start_utc), Date.parse(entry.end_utc) - days * DAY_MS));
    onChange({ ...scenario, start_utc: utcLabel(new Date(start).toISOString()),
      end_utc: utcLabel(new Date(start + days * DAY_MS).toISOString()) });
  }
  return <div className="date-fields">
    <div className="scenario-dates">
      <label className="field">{t("Start (UTC)")}<input type="text" required spellCheck={false} placeholder="2027-01-07T00:00:00Z"
        value={scenario.start_utc} onChange={(event) => onChange({ ...scenario, start_utc: event.target.value })} /></label>
      <label className="field">{t("End (UTC)")}<input type="text" required spellCheck={false} placeholder="2027-01-14T00:00:00Z"
        value={scenario.end_utc} onChange={(event) => onChange({ ...scenario, end_utc: event.target.value })} /></label>
    </div>
    <div className="date-options">
      <small>{bounds.join(" / ")} · {t("Maximum 30 days")}</small>
      <div role="group" aria-label={t("Set duration")}>
        {[[1, "24 h"], [7, "7 d"], [30, "30 d"]].map(([days, name]) =>
          <button key={days} className="button button-small" type="button" onClick={() => duration(Number(days))}>{name}</button>)}
      </div>
    </div>
  </div>;
}

function ScenarioForm({ label, scenario, catalog, separateDates, onChange }: {
  label: string; scenario: Scenario; catalog: Catalog; separateDates: boolean; onChange: (scenario: Scenario) => void;
}) {
  const { t } = useLanguage();
  const entry = catalog.sites.find((item) => item.site.id === scenario.site_id);
  const horizons = entry?.supported_horizons ?? ["geometric"];
  return <fieldset className="scenario-form">
    <legend>{t("Scenario "+label)}</legend>
    <label className="field">{t("Landing site")}<select value={scenario.site_id ?? "custom"}
      onChange={(event) => onChange(changeScenarioSite(scenario, event.target.value, catalog))}>
      {catalog.sites.map(({ site }) => <option key={site.id} value={site.id}>{site.name}</option>)}
      {(catalog.custom_coordinates_supported || scenario.coordinates) && <option value="custom">{t("Custom coordinates")}</option>}
    </select></label>
    {scenario.coordinates && <div className="scenario-dates">
      <label className="field">{t("Latitude (°)")}<input type="number" step="any" min="-89.999999" max="-80"
        value={Number.isFinite(scenario.coordinates.latitude_deg) ? scenario.coordinates.latitude_deg : ""}
        onChange={(e) => onChange({ ...scenario, coordinates: { ...scenario.coordinates!, latitude_deg: e.target.valueAsNumber } })} /></label>
      <label className="field">{t("Longitude east (°)")}<input type="number" step="any" min="0" max="359.999999"
        value={Number.isFinite(scenario.coordinates.longitude_east_deg) ? scenario.coordinates.longitude_east_deg : ""}
        onChange={(e) => onChange({ ...scenario, coordinates: { ...scenario.coordinates!, longitude_east_deg: e.target.valueAsNumber } })} /></label>
    </div>}
    {separateDates && <DateFields scenario={scenario} catalog={catalog} onChange={onChange} />}
    <label className="field">{t("Horizon")}<select value={scenario.horizon ?? "geometric"}
      onChange={(event) => onChange({ ...scenario, horizon: event.target.value as Horizon })}>
      <option value="geometric">{t("Geometric horizon")}</option>
      {horizons.includes("terrain") && <option value="terrain">{t("LOLA terrain horizon")}</option>}
    </select>{!horizons.includes("terrain") && <small className="terrain-badge">{t("Terrain unavailable")}</small>}</label>
  </fieldset>;
}

function csvDownload(result: Comparison) {
  const rows = [["scenario", "site", "horizon", "time_utc", "sun_azimuth_deg", "sun_elevation_deg",
    "sun_horizon_deg", "earth_azimuth_deg", "earth_elevation_deg", "earth_horizon_deg", "disk_visibility", "data_source"]];
  const source = result.demo_only ? "Bundled ephemerides" : "Live API";
  result.scenarios.forEach((scenario, i) => scenario.samples.forEach((s) => rows.push([
    String(i + 1), scenario.site.name, scenario.model.horizon, s.time_utc, String(s.sun.azimuth_deg),
    String(s.sun.elevation_deg), String(s.sun.horizon_elevation_deg), String(s.earth.azimuth_deg),
    String(s.earth.elevation_deg), String(s.earth.horizon_elevation_deg), scenario.model.visibility, source,
  ])));
  const csv = rows.map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "moonsight-comparison.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const metrics: { key: "sun_visible_percent" | "earth_visible_percent" | "both_visible_percent"; label: string; color: string }[] = [
  { key: "sun_visible_percent", label: "Sun visible", color: "sun" },
  { key: "earth_visible_percent", label: "Earth visible", color: "earth" },
  { key: "both_visible_percent", label: "Overlap", color: "overlap" },
];

function ResultPanel({ result, index, scale, active, select }: {
  result: Result;
  index: number;
  scale: [number, number];
  active: number;
  select: (timestamp: string) => void;
}) {
  const { t } = useLanguage();
  const model = result.model.horizon === "terrain" ? "LOLA terrain" : "Geometric horizon";
  return <article className="result-panel">
    <div className="panel-title">
      <span className="scenario-letter">{index ? "B" : "A"}</span>
      <div><h3>{result.site.name}</h3><p>{t(model)} · {`${utcLabel(result.start_utc)} / ${utcLabel(result.end_utc)}`}</p></div>
    </div>
    <div className="metric-row">{metrics.map((item) =>
      <div key={item.key}><span><i className={item.color} />{t(item.label)}</span><strong>{pct(result.summary[item.key])}</strong></div>)}</div>
    <p className="measurement-note">{t(diskLabels[result.model.visibility])} · {t("Airless sky")} · {t("30 min samples")} · {result.ephemeris}</p>
    <ElevationChart result={result} active={active} select={(point) => select(result.samples[point].time_utc)} scale={scale} />
    <div className="plot-head window-head"><h4>{t("Visibility windows")}</h4><span>UTC</span></div>
    <Timeline result={result} active={active} />
    <div className="outages"><span>{t("Longest continuous Sun window")} <b>{(result.summary.longest_sun_window_hours
      ?? Math.max(0, ...result.windows.sun.map((w) => (Date.parse(w.end_utc) - Date.parse(w.start_utc)) / 3_600_000))).toFixed(1)} h</b></span><span>{t("Longest Sun outage")} <b>{result.summary.longest_sun_outage_hours.toFixed(1)} h</b></span>
      <span>{t("Longest Earth outage")} <b>{result.summary.longest_earth_outage_hours.toFixed(1)} h</b></span></div>
  </article>;
}

function sampleIndex(result: Result, progress: number) {
  const start = Date.parse(result.start_utc);
  const target = start + (Date.parse(result.end_utc) - start) * progress;
  let low = 0;
  let high = result.samples.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (Date.parse(result.samples[mid].time_utc) < target) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return low;
  return target - Date.parse(result.samples[low - 1].time_utc)
    <= Date.parse(result.samples[low].time_utc) - target ? low - 1 : low;
}

function comparisonInsight(result: Comparison, t: Translate) {
  const [a, b] = result.scenarios;
  const sameSite = a.site.id === b.site.id
    && a.site.latitude_deg === b.site.latitude_deg && a.site.longitude_east_deg === b.site.longitude_east_deg;
  const samePeriod = a.start_utc === b.start_utc && a.end_utc === b.end_utc;
  if (sameSite && samePeriod && a.model.horizon !== b.model.horizon) {
    const [geometric, terrain] = a.model.horizon === "geometric" ? [a, b] : [b, a];
    const change = terrain.summary.earth_visible_percent - geometric.summary.earth_visible_percent;
    if (Math.abs(change) < .05) return t("Earth visibility is the same with both horizon models at this precision.");
    return t("At {site}, Earth is visible for {before} of the period with a 0° horizon and {after} with terrain.")
      .replace("{site}", a.site.name).replace("{before}", pct(geometric.summary.earth_visible_percent))
      .replace("{after}", pct(terrain.summary.earth_visible_percent));
  }
  return t("{a}: Sun {as}, Earth {ae}, both {ab}. {b}: Sun {bs}, Earth {be}, both {bb}.")
    .replace("{a}", a.site.name === b.site.name ? `${a.site.name} (A)` : a.site.name)
    .replace("{b}", a.site.name === b.site.name ? `${b.site.name} (B)` : b.site.name)
    .replace("{as}", pct(a.summary.sun_visible_percent)).replace("{ae}", pct(a.summary.earth_visible_percent))
    .replace("{ab}", pct(a.summary.both_visible_percent))
    .replace("{bs}", pct(b.summary.sun_visible_percent)).replace("{be}", pct(b.summary.earth_visible_percent))
    .replace("{bb}", pct(b.summary.both_visible_percent));
}

export function Workspace({ initial }: { initial: ScenarioPair }) {
  const { t } = useLanguage();
  const [catalog, setCatalog] = useState<Catalog>(demoCatalog);
  const [pair, setPair] = useState(initial);
  const [separateDates, setSeparateDates] = useState(() => initial[0].start_utc !== initial[1].start_utc || initial[0].end_utc !== initial[1].end_utc);
  const [result, setResult] = useState<Comparison>();
  const [compared, setCompared] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<0 | 1>(0);
  const [showScene, setShowScene] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);
  const horizonDetails = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const { user, ready } = useSession();

  async function run(scenarios: ScenarioPair) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    setNotice("");
    setSaveOpen(false);
    try {
      const next = await compare(scenarios, controller.signal);
      if (controller.signal.aborted) return;
      setResult(next);
      setCompared(scenarios);
      setPlaying(false);
      setProgress(0);
      setView(next.scenarios[0].model.horizon === "geometric" && next.scenarios[1].model.horizon === "terrain" ? 1 : 0);
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Comparison failed");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/lunar/sites", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load site catalog");
        return response.json();
      }).then((remote: Catalog) => {
        if (remote.dataset.version === demoCatalog.dataset.version) setCatalog(remote);
        else if (remote.custom_coordinates_supported) setCatalog({ ...demoCatalog, custom_coordinates_supported: true });
      }).catch(() => { /* The versioned catalog is bundled with the app. */ });
    void run(initial);
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [initial]);

  function update(index: 0 | 1, scenario: Scenario) {
    setPair((current) => index === 0 ? [scenario, current[1]] : [current[0], scenario]);
  }

  function shareDates({ start_utc, end_utc }: Scenario) {
    setPair(([a, b]) => [{ ...a, start_utc, end_utc }, { ...b, start_utc, end_utc }]);
  }

  const valid = !!parsePair(pair) && pair.every((scenario) => rangeValid(scenario, catalog));
  const offline = result?.demo_only || (!result && catalog.demo_only);
  const dirty = JSON.stringify(pair) !== JSON.stringify(compared);
  const chartScale = result ? elevationScale(result.scenarios) : undefined;
  const indices = result?.scenarios.map((scenario) => sampleIndex(scenario, progress));
  const timeSteps = result ? Math.max(...result.scenarios.map((scenario) => scenario.samples.length - 1)) : 1;
  const samePeriod = result && result.scenarios[0].start_utc === result.scenarios[1].start_utc
    && result.scenarios[0].end_utc === result.scenarios[1].end_utc;
  const sceneResult = result?.scenarios[view];
  const sceneSample = sceneResult && indices ? sceneResult.samples[indices[view]] : undefined;
  const terrainEffect = result && samePeriod ? terrainExampleSample(result.scenarios) : undefined;
  const playbackFinished = progress === 1;

  useEffect(() => {
    if (!playing || playbackFinished) return;
    const stepsPerFrame = Math.max(1, Math.ceil(timeSteps / 96));
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(1, current + stepsPerFrame / timeSteps));
    }, 120);
    return () => window.clearInterval(timer);
  }, [playbackFinished, playing, timeSteps]);

  function seek(next: number) {
    setPlaying(false);
    setProgress(next);
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await saveScenario(title, compared, user?.id);
      setNotice(user ? "Saved to your account." : "Saved on this device.");
      setSaveOpen(false);
    } catch (issue) {
      setNotice(issue instanceof Error ? issue.message : "Could not save the comparison.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="workspace-heading compact-heading"><h1>{t("Compare landing sites")}</h1>
      <div className="action-row"><a href="#window-search" className="text-link">{t("Find a 6.5-day window")}</a>
        <Link href="/atlas" className="text-link">{t("Lunar atlas")} <Icon name="arrow-right" width={16} /></Link></div></div>

    {catalog && <form className="controls-panel" onSubmit={(e) => {
      e.preventDefault();
      if (valid) void run(pair);
      else setError("Enter valid coordinates and dates for both scenarios.");
    }}>
      <div className="preset-chips" role="group" aria-label={t("Preset")}>
        {PRESETS.map((preset) => <button type="button" className="button preset-chip" key={preset.id}
          aria-pressed={JSON.stringify(preset.scenarios) === JSON.stringify(pair)} onClick={() => {
            setPair(preset.scenarios);
            setSeparateDates(false);
            void run(preset.scenarios);
          }}><strong>{t(preset.label)}</strong><small>{t(preset.description)}</small></button>)}
      </div>
      <div className="scenario-grid">
        <ScenarioForm label="A" scenario={pair[0]} catalog={catalog} separateDates={separateDates} onChange={(scenario) => update(0, scenario)} />
        <ScenarioForm label="B" scenario={pair[1]} catalog={catalog} separateDates={separateDates} onChange={(scenario) => update(1, scenario)} />
      </div>
      <div className="period-control">
        {!separateDates && <DateFields scenario={pair[0]} catalog={catalog} onChange={shareDates} />}
        <label className="date-mode"><input type="checkbox" checked={separateDates} onChange={(event) => {
          if (!event.target.checked) shareDates(pair[0]);
          setSeparateDates(event.target.checked);
        }} /> {t("Separate dates")}</label>
      </div>
      <div className="controls-footer">
        <label className="field"><span>{t("Visible when")}</span><select value={pair[0].visibility ?? "disk_center"}
          onChange={(event) => {
            const visibility = event.target.value as DiskVisibility;
            setPair(([a, b]) => [{ ...a, visibility }, { ...b, visibility }]);
          }}>{Object.entries(diskLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select>
        </label>
        {offline && <p role="status">{t("Offline mode · Catalog sites, 2027-01-01 / 2027-04-01 UTC")}</p>}
        <button className="button button-primary" disabled={loading || !valid} type="submit"><Icon name="arrows-exchange" width={18} />
          {loading ? t("Comparing…") : t("Run comparison")}</button></div>
    </form>}

    {error && <p className="feedback error" role="alert">{t(error)}</p>}
    {loading && !result && <p className="feedback" role="status">{t("Loading comparison…")}</p>}
    {result && <section className="results" aria-label={t("Comparison results")} aria-busy={loading}>
      <header className="results-header"><div><h2>{t("Results")}</h2>{dirty && <p>{t("Run again to apply your changes.")}</p>}</div>
        <div className="result-actions">
          <details className="export-actions"><summary className="button button-small">{t("Export")}</summary><div>
            <button className="button button-small" onClick={() => csvDownload(result)}>CSV</button>
            <button className="button button-small" onClick={() => window.print()}>{t("Print report")}</button>
          </div></details>
          <button className="button button-small" onClick={async () => {
            const url = new URL("/workspace", window.location.origin);
            url.searchParams.set("scenario", JSON.stringify(compared));
            try { await navigator.clipboard.writeText(url.href); setNotice("Comparison link copied."); }
            catch { router.replace(url.pathname + url.search, { scroll: false }); setNotice("Copy the comparison link from the address bar."); }
          }}><Icon name="link" />{t("Share")}</button>
          <button className="button button-small" disabled={!ready} onClick={() => setSaveOpen(!saveOpen)}>
            <Icon name="bookmark" />{t("Save")}</button>
        </div>
      </header>
      {result.demo_only && <p className="result-source" role="status">{t("Offline results · Bundled JPL Horizons data")}</p>}
      {saveOpen && <form className="panel save-form" onSubmit={onSave}>
        <label className="field">{t("Scenario title")}<input name="title" maxLength={100} required autoFocus defaultValue={`${result.scenarios[0].site.name} / ${result.scenarios[1].site.name}`} /></label>
        <button className="button button-primary" disabled={saving}>{saving ? t("Saving…") : t("Save scenario")}</button>
        {!user && <span>{t("Guest saves stay on this device.")}</span>}
      </form>}
      {notice && <p className="feedback" role="status">{t(notice)}</p>}
      <div className="insight">
        <p aria-live="polite">{comparisonInsight(result, t)}</p>
        {result.scenarios[0].model.horizon !== result.scenarios[1].model.horizon && <p className="measurement-note">{t("The scenarios use different horizon models.")}</p>}
        {result.scenarios.some(({ model }) => model.visibility !== "disk_center") && <p className="measurement-note">{t("Disk edges use nominal angular radii: Sun 0.2666°, Earth 0.95°. Terrain is sampled at the disk center azimuth.")}</p>}
        {terrainEffect && <button className="insight-link" type="button" onClick={() => {
          const scenario = result.scenarios[terrainEffect.view];
          const timestamp = Date.parse(terrainEffect.timestamp);
          setView(terrainEffect.view);
          seek((timestamp - Date.parse(scenario.start_utc))
            / (Date.parse(scenario.end_utc) - Date.parse(scenario.start_utc)));
          setShowScene(true);
          if (horizonDetails.current) {
            horizonDetails.current.open = true;
            horizonDetails.current.scrollIntoView({ block: "nearest" });
            horizonDetails.current.querySelector("summary")?.focus({ preventScroll: true });
          }
        }}>{t("Show the obstruction")} <Icon name="arrow-down" width={16} /></button>}
      </div>
      {sceneResult && sceneSample && <VisibilityOverview sample={sceneSample} site={sceneResult.site.name} view={view} select={setView} />}
      {indices && <div className="time-control">
        <div><label htmlFor="comparison-time">{samePeriod ? t("Time (UTC)") : t("Progress through each period")}</label>
          <span>{samePeriod ? utcLabel(result.scenarios[0].samples[indices[0]].time_utc)
            : `A · ${utcLabel(result.scenarios[0].samples[indices[0]].time_utc)} / B · ${utcLabel(result.scenarios[1].samples[indices[1]].time_utc)}`}</span></div>
        <div className="time-playback">
          <button className="button button-small" type="button" onClick={() => {
            if (playbackFinished) { setProgress(0); setPlaying(true); }
            else setPlaying(!playing);
          }}>{playbackFinished ? t("Replay") : playing ? t("Pause") : t("Play")}</button>
          <input type="range" id="comparison-time" min={0} max={timeSteps} value={Math.round(progress * timeSteps)}
            onChange={(event) => seek(Number(event.target.value) / timeSteps)}
            aria-valuetext={samePeriod ? utcLabel(result.scenarios[0].samples[indices[0]].time_utc) : `${Math.round(progress * 100)} percent`} />
        </div>
      </div>}
      <div className="scenario-grid comparison-grid">{chartScale && indices && result.scenarios.map((scenario, index) =>
        <ResultPanel key={index} result={scenario} index={index} scale={chartScale} active={indices[index]}
          select={(timestamp) => seek((Date.parse(timestamp) - Date.parse(scenario.start_utc))
            / (Date.parse(scenario.end_utc) - Date.parse(scenario.start_utc)))} />)}</div>
      <details className="horizon-details" ref={horizonDetails} open={showScene} onToggle={(event) => setShowScene(event.currentTarget.open)}>
        <summary>{t("Inspect the horizon in 3D")}</summary>
        <div className="horizon-head"><div className="segmented" aria-label={t("3D scenario")}>
          <button type="button" aria-pressed={view === 0} onClick={() => setView(0)}>{t("Scenario A")}</button>
          <button type="button" aria-pressed={view === 1} onClick={() => setView(1)}>{t("Scenario B")}</button>
        </div></div>
        {showScene && sceneResult && sceneSample && <>
          <div className="scene-time"><label htmlFor="horizon-time">{t("Horizon time")}</label>
            <input type="range" id="horizon-time" min={0} max={timeSteps} value={Math.round(progress * timeSteps)}
              onChange={(event) => seek(Number(event.target.value) / timeSteps)}
              aria-valuetext={utcLabel(sceneSample.time_utc)} />
            <output htmlFor="horizon-time">{utcLabel(sceneSample.time_utc)}</output>
          </div>
          <MissionScene result={sceneResult} sample={sceneSample} />
        </>}
      </details>
      <details className="report-method">
        <summary>{t("Data and assumptions")}</summary>
        <p>{t("Angles are in degrees and time is UTC.")}</p>
        <p>{result.dataset.ephemeris} · {result.dataset.step_minutes}-minute samples · {result.dataset.coordinate_frame}
          {result.scenarios.some((scenario) => scenario.model.horizon === "terrain") && " · LOLA terrain, up to 45 km"}</p>
        <p><a href={result.dataset.ephemeris_source_url}>NASA JPL Horizons</a> · <a href="https://pgda.gsfc.nasa.gov/products/90">NASA LOLA elevation model</a></p>
      </details>
    </section>}
    <WindowSearch />
  </>;
}

function terrainExampleSample([a, b]: [Result, Result]) {
  if (a.site.id !== b.site.id || a.model.horizon === b.model.horizon) return;
  const view = a.model.horizon === "terrain" ? 0 : 1;
  const [terrain, geometric] = view === 0 ? [a, b] : [b, a];
  const clearTimes = new Set(geometric.samples.filter((sample) => sample.earth.above_horizon)
    .map((sample) => sample.time_utc));
  const blocked = terrain.samples.filter((sample) => !sample.earth.above_horizon && clearTimes.has(sample.time_utc));
  if (blocked.length) return { view, timestamp: blocked[Math.floor(blocked.length / 2)].time_utc } as const;
}
