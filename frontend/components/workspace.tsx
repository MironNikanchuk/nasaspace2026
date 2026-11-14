"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { useSession } from "./session";
import { ElevationChart, Timeline, elevationScale, utcLabel } from "./charts";
import { PRESETS, parsePair } from "@/lib/presets";
import { saveScenario } from "@/lib/saved";
import type { Catalog, Comparison, Horizon, Result, Scenario, ScenarioPair } from "@/lib/types";

function localInput(value: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}
function fromInput(value: string) {
  return value ? `${value.length === 16 ? value + ":00" : value}Z` : "";
}
function pct(value: number) {
  return `${value.toFixed(1)}%`;
}
function changeScenarioSite(scenario: Scenario, id: string, catalog: Catalog): Scenario {
  if (id === "custom") return { ...scenario, site_id: undefined, horizon: "geometric",
    coordinates: { latitude_deg: -89.4632, longitude_east_deg: 222.51 } };
  const allowed = catalog.sites.find((entry) => entry.site.id === id)?.supported_horizons;
  return { ...scenario, site_id: id, coordinates: undefined,
    horizon: allowed?.includes(scenario.horizon ?? "geometric") ? scenario.horizon : "geometric" };
}

async function compare(pair: ScenarioPair, signal: AbortSignal): Promise<Comparison> {
  const response = await fetch("/api/lunar/compare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarios: pair }), signal,
  });
  const answer = await response.json();
  if (!response.ok) {
    const message = Array.isArray(answer.detail)
      ? answer.detail.map((part: { msg: string }) => part.msg).join(" · ")
      : answer.detail;
    throw new Error(message || "Could not compare the selected scenarios");
  }
  return answer;
}

function ScenarioForm({ label, scenario, catalog, onChange }: {
  label: string; scenario: Scenario; catalog: Catalog; onChange: (scenario: Scenario) => void;
}) {
  const entry = catalog.sites.find((item) => item.site.id === scenario.site_id);
  const horizons = entry?.supported_horizons ?? ["geometric"];
  return <fieldset className="scenario-form">
    <legend><span className="scenario-letter">{label}</span> Scenario {label}</legend>
    <label className="field">Landing site<select value={scenario.site_id ?? "custom"}
      onChange={(event) => onChange(changeScenarioSite(scenario, event.target.value, catalog))}>
      {catalog.sites.map(({ site }) => <option key={site.id} value={site.id}>{site.name}</option>)}
      {(catalog.custom_coordinates_supported || scenario.coordinates) && <option value="custom">Custom coordinates</option>}
    </select></label>
    {scenario.coordinates && <div className="scenario-dates">
      <label className="field">Latitude (°)<input type="number" step="any" min="-89.999999" max="-80"
        value={Number.isFinite(scenario.coordinates.latitude_deg) ? scenario.coordinates.latitude_deg : ""}
        onChange={(e) => onChange({ ...scenario, coordinates: { ...scenario.coordinates!, latitude_deg: e.target.valueAsNumber } })} /></label>
      <label className="field">Longitude east (°)<input type="number" step="any" min="0" max="359.999999"
        value={Number.isFinite(scenario.coordinates.longitude_east_deg) ? scenario.coordinates.longitude_east_deg : ""}
        onChange={(e) => onChange({ ...scenario, coordinates: { ...scenario.coordinates!, longitude_east_deg: e.target.valueAsNumber } })} /></label>
    </div>}
    <div className="scenario-dates">
      <label className="field">Start (UTC)<input type="datetime-local" required value={localInput(scenario.start_utc)}
        onChange={(event) => onChange({ ...scenario, start_utc: fromInput(event.target.value) })} /></label>
      <label className="field">End (UTC)<input type="datetime-local" required value={localInput(scenario.end_utc)}
        onChange={(event) => onChange({ ...scenario, end_utc: fromInput(event.target.value) })} /></label>
    </div>
    <label className="field">Horizon<select value={scenario.horizon ?? "geometric"}
      onChange={(event) => onChange({ ...scenario, horizon: event.target.value as Horizon })}>
      <option value="geometric">Geometric horizon</option>
      {horizons.includes("terrain") && <option value="terrain">LOLA terrain horizon</option>}
    </select></label>
  </fieldset>;
}

function csvDownload(result: Comparison) {
  const rows = [["scenario", "site", "horizon", "time_utc", "sun_azimuth_deg", "sun_elevation_deg",
    "sun_horizon_deg", "earth_azimuth_deg", "earth_elevation_deg", "earth_horizon_deg"]];
  result.scenarios.forEach((scenario, i) => scenario.samples.forEach((s) => rows.push([
    String(i + 1), scenario.site.name, scenario.model.horizon, s.time_utc, String(s.sun.azimuth_deg),
    String(s.sun.elevation_deg), String(s.sun.horizon_elevation_deg), String(s.earth.azimuth_deg),
    String(s.earth.elevation_deg), String(s.earth.horizon_elevation_deg),
  ])));
  const csv = rows.map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lunawindow-comparison.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const metrics: { key: keyof Result["summary"]; label: string; color: string }[] = [
  { key: "sun_visible_percent", label: "Sun visible", color: "sun" },
  { key: "earth_visible_percent", label: "Earth visible", color: "earth" },
  { key: "both_visible_percent", label: "Overlap", color: "overlap" },
];

function ResultPanel({ result, index, scale }: { result: Result; index: number; scale: [number, number] }) {
  const [active, setActive] = useState(0);
  const selected = result.samples[active];
  return <article className="panel result-panel">
    <div className="panel-title"><span className="scenario-letter">{index ? "B" : "A"}</span><div>
      <h3>{result.site.name}</h3>
      <p>{result.model.horizon === "terrain" ? "LOLA terrain horizon" : "Geometric horizon"}</p>
    </div></div>
    <div className="metric-row">{metrics.map((item) =>
      <div key={item.key}><span><i className={item.color} />{item.label}</span><strong>{pct(result.summary[item.key])}</strong></div>)}</div>
    <div className="plot-head"><h4>Elevation</h4><span>Degrees above local horizontal</span></div>
    <ElevationChart result={result} active={active} select={setActive} scale={scale} />
    <label className="scrubber"><span>{utcLabel(selected.time_utc)}</span><input aria-label={`Time cursor for scenario ${index ? "B" : "A"}`}
      type="range" min={0} max={result.samples.length - 1} value={active} onChange={(e) => setActive(Number(e.target.value))} /></label>
    <div className="coordinates-readout"><span>Sun <b>{selected.sun.azimuth_deg.toFixed(1)}° az · {selected.sun.elevation_deg.toFixed(1)}° el</b></span>
      <span>Earth <b>{selected.earth.azimuth_deg.toFixed(1)}° az · {selected.earth.elevation_deg.toFixed(1)}° el</b></span></div>
    <div className="plot-head window-head"><h4>Visibility windows</h4><span>UTC</span></div>
    <Timeline result={result} />
    <div className="outages"><span>Longest Sun outage <b>{result.summary.longest_sun_outage_hours.toFixed(1)} h</b></span>
      <span>Longest Earth outage <b>{result.summary.longest_earth_outage_hours.toFixed(1)} h</b></span></div>
    {result.model.horizon === "terrain" && <p className="source-note">Dashed lines show terrain along each body’s azimuth.</p>}
  </article>;
}

export function Workspace({ initial }: { initial: ScenarioPair }) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [pair, setPair] = useState(initial);
  const [result, setResult] = useState<Comparison>();
  const [compared, setCompared] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
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
      setResult(await compare(scenarios, controller.signal));
      setCompared(scenarios);
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
      }).then(setCatalog).catch((issue: Error) => {
        if (!controller.signal.aborted) setError(issue.message);
      });
    void run(initial);
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [initial]);

  function update(index: 0 | 1, scenario: Scenario) {
    setPair(index === 0 ? [scenario, pair[1]] : [pair[0], scenario]);
  }

  const dirty = JSON.stringify(pair) !== JSON.stringify(compared);
  const chartScale = result ? elevationScale(result.scenarios) : undefined;
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
    <div className="workspace-heading"><div>
      <p className="eyebrow"><span /> LUNAR SOUTH POLE</p>
      <h1>Compare landing sites</h1>
      <p>Explore sunlight, line of sight to Earth, and when both are available.</p>
    </div><div className="availability"><i />{catalog?.demo_only ? "Demo dataset" : catalog ? "API connected" : "Loading catalog"}</div></div>

    <div className="preset-bar" aria-label="Comparison presets"><span>Presets</span>
      {PRESETS.map((preset) => <button type="button" className="button button-small" key={preset.id}
        onClick={() => { setPair(preset.scenarios); void run(preset.scenarios); }}>{preset.label}</button>)}</div>

    {catalog && <form className="panel controls-panel" onSubmit={(e) => {
      e.preventDefault();
      if (parsePair(pair)) void run(pair);
      else setError("Enter valid coordinates and dates for both scenarios.");
    }}>
      <div className="scenario-grid">
        <ScenarioForm label="A" scenario={pair[0]} catalog={catalog} onChange={(scenario) => update(0, scenario)} />
        <ScenarioForm label="B" scenario={pair[1]} catalog={catalog} onChange={(scenario) => update(1, scenario)} />
      </div>
      <div className="controls-footer"><p>{catalog.demo_only ? "Bundled results cover January 7–14, 2027 UTC." :
        `Up to ${catalog.max_duration_days} days per scenario · ${catalog.dataset.step_minutes}-minute samples`}</p>
        <button className="button button-primary" disabled={loading || !parsePair(pair)} type="submit"><Icon name="arrows-exchange" width={18} />
          {loading ? "Comparing…" : "Run comparison"}</button></div>
    </form>}

    {error && <p className="feedback error" role="alert">{error}</p>}
    {loading && !result && <p className="feedback" role="status">Loading comparison…</p>}
    {result && <section className="results" aria-label="Comparison results" aria-busy={loading}>
      <header className="results-header"><div><h2>Comparison</h2><p>{result.demo_only ? "Bundled NASA results" : "Calculated from NASA data"}
        {dirty ? " · Parameters changed" : ""}</p></div>
        <div className="result-actions">
          <button className="button button-small" onClick={() => csvDownload(result)}><Icon name="software-download" />Export CSV</button>
          <button className="button button-small" onClick={async () => {
            const url = new URL("/workspace", window.location.origin);
            url.searchParams.set("scenario", JSON.stringify(compared));
            try { await navigator.clipboard.writeText(url.href); setNotice("Comparison link copied."); }
            catch { router.replace(url.pathname + url.search, { scroll: false }); setNotice("Copy the comparison link from the address bar."); }
          }}><Icon name="link" />Share</button>
          <button className="button button-small" disabled={!ready} onClick={() => setSaveOpen(!saveOpen)}>
            <Icon name="bookmark" />Save</button>
        </div>
      </header>
      {saveOpen && <form className="panel save-form" onSubmit={onSave}>
        <label className="field">Scenario title<input name="title" maxLength={100} required autoFocus defaultValue={`${result.scenarios[0].site.name} / ${result.scenarios[1].site.name}`} /></label>
        <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save scenario"}</button>
        {!user && <span>Saved on this device. <Link href="/account">Sign in for cloud saves.</Link></span>}
      </form>}
      {notice && <p className="feedback" role="status">{notice}</p>}
      <div className="scenario-grid">{chartScale && result.scenarios.map((scenario, index) =>
        <ResultPanel key={`${index}/${scenario.site.id}/${scenario.site.latitude_deg}/${scenario.site.longitude_east_deg}/${scenario.start_utc}/${scenario.end_utc}/${scenario.model.horizon}`} result={scenario} index={index} scale={chartScale} />)}</div>
      <p className="dashboard-note">Visibility uses the center of each body. Earth visibility estimates a potential line of sight. <Link href="/#method">Method and sources</Link></p>
    </section>}
  </>;
}
