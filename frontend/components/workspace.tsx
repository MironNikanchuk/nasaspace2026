"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { useSession } from "./session";
import { ElevationChart, Timeline, elevationScale, utcLabel } from "./charts";
import { PRESETS, parsePair } from "@/lib/presets";
import { saveScenario } from "@/lib/saved";
import type { Catalog, Comparison, Horizon, Result, Scenario, ScenarioPair } from "@/lib/types";

const MissionScene = dynamic(() => import("./mission-scene").then((module) => module.MissionScene), {
  ssr: false,
  loading: () => <div className="scene-placeholder" role="status">Preparing the 3D horizon…</div>,
});

function localInput(value: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}
function fromInput(value: string) {
  return value ? `${value.length === 16 ? value + ":00" : value}Z` : "";
}
function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});
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

function DateFields({ scenario, onChange }: { scenario: Scenario; onChange: (scenario: Scenario) => void }) {
  return <div className="scenario-dates">
    <label className="field">Start (UTC)<input type="datetime-local" required value={localInput(scenario.start_utc)}
      onChange={(event) => onChange({ ...scenario, start_utc: fromInput(event.target.value) })} /></label>
    <label className="field">End (UTC)<input type="datetime-local" required value={localInput(scenario.end_utc)}
      onChange={(event) => onChange({ ...scenario, end_utc: fromInput(event.target.value) })} /></label>
  </div>;
}

function ScenarioForm({ label, scenario, catalog, separateDates, onChange }: {
  label: string; scenario: Scenario; catalog: Catalog; separateDates: boolean; onChange: (scenario: Scenario) => void;
}) {
  const entry = catalog.sites.find((item) => item.site.id === scenario.site_id);
  const horizons = entry?.supported_horizons ?? ["geometric"];
  return <fieldset className="scenario-form">
    <legend>Scenario {label}</legend>
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
    {separateDates && <DateFields scenario={scenario} onChange={onChange} />}
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
  anchor.download = "moonsight-comparison.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const metrics: { key: keyof Result["summary"]; label: string; color: string }[] = [
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
  const model = result.model.horizon === "terrain" ? "LOLA terrain" : "Geometric horizon";
  return <article className="result-panel">
    <div className="panel-title">
      <span className="scenario-letter">{index ? "B" : "A"}</span>
      <div><h3>{result.site.name}</h3><p>{model} · {shortDate.formatRange(new Date(result.start_utc), new Date(result.end_utc))} UTC</p></div>
    </div>
    <div className="metric-row">{metrics.map((item) =>
      <div key={item.key}><span><i className={item.color} />{item.label}</span><strong>{pct(result.summary[item.key])}</strong></div>)}</div>
    <ElevationChart result={result} active={active} select={(point) => select(result.samples[point].time_utc)} scale={scale} />
    <div className="plot-head window-head"><h4>Visibility windows</h4><span>UTC</span></div>
    <Timeline result={result} />
    <div className="outages"><span>Longest Sun outage <b>{result.summary.longest_sun_outage_hours.toFixed(1)} h</b></span>
      <span>Longest Earth outage <b>{result.summary.longest_earth_outage_hours.toFixed(1)} h</b></span></div>
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

function comparisonInsight(result: Comparison) {
  const [a, b] = result.scenarios;
  const sameSite = a.site.id === b.site.id
    && a.site.latitude_deg === b.site.latitude_deg && a.site.longitude_east_deg === b.site.longitude_east_deg;
  const samePeriod = a.start_utc === b.start_utc && a.end_utc === b.end_utc;
  if (sameSite && samePeriod && a.model.horizon !== b.model.horizon) {
    const [geometric, terrain] = a.model.horizon === "geometric" ? [a, b] : [b, a];
    const change = terrain.summary.earth_visible_percent - geometric.summary.earth_visible_percent;
    if (Math.abs(change) < .05) return "Earth visibility is the same with both horizon models at this precision.";
    return `At ${a.site.name}, terrain ${change < 0 ? "reduces" : "increases"} Earth visibility from ${pct(geometric.summary.earth_visible_percent)} to ${pct(terrain.summary.earth_visible_percent)}.`;
  }
  const change = a.summary.both_visible_percent - b.summary.both_visible_percent;
  if (Math.abs(change) < .05) return `Both scenarios give ${pct(a.summary.both_visible_percent)} simultaneous Sun and Earth visibility at this precision.`;
  const winner = change > 0 ? "A" : "B";
  return `Scenario ${winner} has ${Math.abs(change).toFixed(1)} percentage points more simultaneous Sun and Earth visibility.`;
}

export function Workspace({ initial }: { initial: ScenarioPair }) {
  const [catalog, setCatalog] = useState<Catalog>();
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
  const [view, setView] = useState<0 | 1>(0);
  const [showScene, setShowScene] = useState(false);
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
      setResult(await compare(scenarios, controller.signal));
      setCompared(scenarios);
      setProgress(0);
      setView(0);
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
    setPair((current) => index === 0 ? [scenario, current[1]] : [current[0], scenario]);
  }

  function shareDates({ start_utc, end_utc }: Scenario) {
    setPair(([a, b]) => [{ ...a, start_utc, end_utc }, { ...b, start_utc, end_utc }]);
  }

  const dirty = JSON.stringify(pair) !== JSON.stringify(compared);
  const chartScale = result ? elevationScale(result.scenarios) : undefined;
  const indices = result?.scenarios.map((scenario) => sampleIndex(scenario, progress));
  const timeSteps = result ? Math.max(...result.scenarios.map((scenario) => scenario.samples.length - 1)) : 1;
  const samePeriod = result && result.scenarios[0].start_utc === result.scenarios[1].start_utc
    && result.scenarios[0].end_utc === result.scenarios[1].end_utc;
  const sceneResult = result?.scenarios[view];
  const sceneSample = sceneResult && indices ? sceneResult.samples[indices[view]] : undefined;
  const terrainEffect = result && samePeriod ? terrainExampleSample(result.scenarios) : undefined;
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
    <div className="workspace-heading"><h1>Compare landing sites</h1>
      <Link href="/atlas" className="text-link">Lunar atlas <Icon name="arrow-right" width={16} /></Link></div>

    {catalog && <form className="controls-panel" onSubmit={(e) => {
      e.preventDefault();
      if (parsePair(pair)) void run(pair);
      else setError("Enter valid coordinates and dates for both scenarios.");
    }}>
      <div className="scenario-grid">
        <ScenarioForm label="A" scenario={pair[0]} catalog={catalog} separateDates={separateDates} onChange={(scenario) => update(0, scenario)} />
        <ScenarioForm label="B" scenario={pair[1]} catalog={catalog} separateDates={separateDates} onChange={(scenario) => update(1, scenario)} />
      </div>
      <div className="period-control">
        {!separateDates && <DateFields scenario={pair[0]} onChange={shareDates} />}
        <label className="date-mode"><input type="checkbox" checked={separateDates} onChange={(event) => {
          if (!event.target.checked) shareDates(pair[0]);
          setSeparateDates(event.target.checked);
        }} /> Separate dates</label>
      </div>
      <div className="controls-footer">
        <label className="field preset-field"><span>Preset</span><select value={PRESETS.find((preset) =>
          JSON.stringify(preset.scenarios) === JSON.stringify(pair))?.id ?? ""} onChange={(event) => {
          const preset = PRESETS.find((item) => item.id === event.target.value);
          if (!preset) return;
          setPair(preset.scenarios);
          setSeparateDates(false);
          void run(preset.scenarios);
        }}>
          <option value="" disabled>Choose preset</option>
          {PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select></label>
        {catalog.demo_only && <p>Available offline · Jan 7–14</p>}
        <button className="button button-primary" disabled={loading || !parsePair(pair)} type="submit"><Icon name="arrows-exchange" width={18} />
          {loading ? "Comparing…" : "Run comparison"}</button></div>
    </form>}

    {error && <p className="feedback error" role="alert">{error}</p>}
    {loading && !result && <p className="feedback" role="status">Loading comparison…</p>}
    {result && <section className="results" aria-label="Comparison results" aria-busy={loading}>
      <header className="results-header"><div><h2>Results</h2>{dirty && <p>Run again to apply your changes.</p>}</div>
        <div className="result-actions">
          <details className="export-actions"><summary className="button button-small">Export</summary><div>
            <button className="button button-small" onClick={() => csvDownload(result)}>CSV</button>
            <button className="button button-small" onClick={() => window.print()}>Print report</button>
          </div></details>
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
        {!user && <span>Guest saves stay on this device.</span>}
      </form>}
      {notice && <p className="feedback" role="status">{notice}</p>}
      <div className="insight">
        <p aria-live="polite">{comparisonInsight(result)}</p>
        {terrainEffect && <button className="insight-link" type="button" onClick={() => {
          const scenario = result.scenarios[terrainEffect.view];
          const timestamp = Date.parse(terrainEffect.timestamp);
          setView(terrainEffect.view);
          setProgress((timestamp - Date.parse(scenario.start_utc))
            / (Date.parse(scenario.end_utc) - Date.parse(scenario.start_utc)));
          setShowScene(true);
          if (horizonDetails.current) {
            horizonDetails.current.open = true;
            horizonDetails.current.scrollIntoView({ block: "nearest" });
            horizonDetails.current.querySelector("summary")?.focus({ preventScroll: true });
          }
        }}>Show the obstruction <Icon name="arrow-down" width={16} /></button>}
      </div>
      {indices && <div className="time-control">
        <div><label htmlFor="comparison-time">{samePeriod ? "Time (UTC)" : "Progress through each period"}</label>
          <span>{samePeriod ? utcLabel(result.scenarios[0].samples[indices[0]].time_utc)
            : `A · ${utcLabel(result.scenarios[0].samples[indices[0]].time_utc)} / B · ${utcLabel(result.scenarios[1].samples[indices[1]].time_utc)}`}</span></div>
        <input type="range" id="comparison-time" min={0} max={timeSteps} value={Math.round(progress * timeSteps)}
          onChange={(event) => setProgress(Number(event.target.value) / timeSteps)}
          aria-valuetext={samePeriod ? utcLabel(result.scenarios[0].samples[indices[0]].time_utc) : `${Math.round(progress * 100)} percent`} />
      </div>}
      <div className="scenario-grid comparison-grid">{chartScale && indices && result.scenarios.map((scenario, index) =>
        <ResultPanel key={index} result={scenario} index={index} scale={chartScale} active={indices[index]}
          select={(timestamp) => setProgress((Date.parse(timestamp) - Date.parse(scenario.start_utc))
            / (Date.parse(scenario.end_utc) - Date.parse(scenario.start_utc)))} />)}</div>
      <details className="horizon-details" ref={horizonDetails} onToggle={(event) => { if (event.currentTarget.open) setShowScene(true); }}>
        <summary>Inspect the horizon in 3D</summary>
        <div className="horizon-head"><div className="segmented" aria-label="3D scenario">
          <button type="button" aria-pressed={view === 0} onClick={() => setView(0)}>Scenario A</button>
          <button type="button" aria-pressed={view === 1} onClick={() => setView(1)}>Scenario B</button>
        </div></div>
        {showScene && sceneResult && sceneSample && <>
          <div className="scene-time"><label htmlFor="horizon-time">Horizon time</label>
            <input type="range" id="horizon-time" min={0} max={timeSteps} value={Math.round(progress * timeSteps)}
              onChange={(event) => setProgress(Number(event.target.value) / timeSteps)}
              aria-valuetext={utcLabel(sceneSample.time_utc)} />
            <output htmlFor="horizon-time">{utcLabel(sceneSample.time_utc)}</output>
          </div>
          <MissionScene result={sceneResult} sample={sceneSample} />
        </>}
      </details>
      <details className="report-method">
        <summary>Data and assumptions</summary>
        <p>Visibility uses each body’s center. Angles are in degrees and time is UTC.</p>
        <p>{result.dataset.ephemeris} · {result.dataset.step_minutes}-minute samples · {result.dataset.coordinate_frame}
          {result.scenarios.some((scenario) => scenario.model.horizon === "terrain") && " · LOLA terrain, up to 45 km"}</p>
        <p><a href={result.dataset.ephemeris_source_url}>NASA JPL Horizons</a> · <a href="https://pgda.gsfc.nasa.gov/products/90">NASA LOLA elevation model</a></p>
      </details>
    </section>}
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
