"use client";

import { useLanguage } from "./language";
import { DAY_MS, numberLabel } from "@/lib/format";
import { useId } from "react";
import type { Result, Sample, Window } from "@/lib/types";

const colors = { sun: "var(--sun)", earth: "var(--earth)", both: "var(--overlap)" };
function tickLabel(time: number, duration: number) {
  const iso = new Date(time).toISOString();
  return duration >= DAY_MS ? iso.slice(0, 10) : iso.slice(11, 16);
}

export function elevationScale(results: Result[]): [number, number] {
  let minimum = -5;
  let maximum = 5;
  for (const { samples } of results) {
    for (const sample of samples) {
      for (const body of [sample.sun, sample.earth]) {
        minimum = Math.min(minimum, body.elevation_deg, body.horizon_elevation_deg);
        maximum = Math.max(maximum, body.elevation_deg, body.horizon_elevation_deg);
      }
    }
  }
  return [Math.floor(minimum / 5) * 5, Math.ceil(maximum / 5) * 5];
}

export function ElevationChart({ result, active, select, scale }: {
  result: Result; active: number; select: (index: number) => void; scale: [number, number];
}) {
  const id = useId();
  const { t } = useLanguage();
  const { samples } = result;
  const width = 660, height = 222, left = 44, right = 16, top = 14, bottom = 34;
  const start = Date.parse(result.start_utc), end = Date.parse(result.end_utc);
  const [yMin, yMax] = scale;
  const x = (time: number) => left + (time - start) / (end - start) * (width - left - right);
  const y = (angle: number) => top + (yMax - angle) / (yMax - yMin) * (height - top - bottom);
  const path = (read: (sample: Sample) => number) => samples.map((s, i) =>
    `${i === 0 ? "M" : "L"}${x(Date.parse(s.time_utc)).toFixed(2)},${y(read(s)).toFixed(2)}`).join(" ");
  const selected = samples[Math.min(active, samples.length - 1)];
  const cursorX = x(Date.parse(selected.time_utc));
  const ticks = Array.from({ length: 3 }, (_, i) => start + (end - start) * i / 2);
  const angles = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * i / 4);
  return <figure className="elevation-figure">
    <figcaption className="chart-legend">
      <span><i className="sun-key" />{t("Sun")}</span>
      <span><i className="earth-key" />{t("Earth")}</span>
      <span><i className="horizon-key" />{t("Horizon")}</span>
    </figcaption>
    <svg className="elevation-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id} aria-describedby={id + "-data"}
    onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = (event.clientX - rect.left) / rect.width * width;
      const timestamp = start + (scale - left) / (width - left - right) * (end - start);
      const closest = samples.reduce((best, sample, index) =>
        Math.abs(Date.parse(sample.time_utc) - timestamp) < Math.abs(Date.parse(samples[best].time_utc) - timestamp) ? index : best, 0);
      select(closest);
    }}>
    <title id={id}>{result.site.name} · {t("Elevation and horizon")}</title>
    <desc id={id + "-data"}>{selected.time_utc} · {t("Sun")} {numberLabel(selected.sun.elevation_deg)}° · {t("Earth")} {numberLabel(selected.earth.elevation_deg)}°</desc>
    {angles.map((angle) => <g key={angle}><line x1={left} x2={width - right} y1={y(angle)} y2={y(angle)} className="chart-grid" />
      <text x={left - 8} y={y(angle) + 4} textAnchor="end">{String(Number(angle.toFixed(1))).replace("-", "−")}°</text></g>)}
    {ticks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} className="chart-grid" />
      <text x={x(tick)} y={height - 10} textAnchor={tick === start ? "start" : tick === end ? "end" : "middle"}>{tickLabel(tick, end - start)}</text></g>)}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero" />
    {result.model.horizon === "terrain" && (["sun", "earth"] as const).map((body) =>
      <path key={body} d={path((s) => s[body].horizon_elevation_deg)} stroke={colors[body]} strokeDasharray="3 4" opacity=".52" fill="none" />)}
    {(["sun", "earth"] as const).map((body) =>
      <path key={body} d={path((s) => s[body].elevation_deg)} stroke={colors[body]} strokeWidth="1.9"
        strokeDasharray={body === "earth" ? "6 3" : undefined} fill="none" vectorEffect="non-scaling-stroke" />)}
    <line x1={cursorX} x2={cursorX} y1={top} y2={height - bottom} className="chart-cursor" />
    {(["sun", "earth"] as const).map((body) =>
      <circle key={body} cx={cursorX} cy={y(selected[body].elevation_deg)} r="3.2" fill={colors[body]} />)}
  </svg></figure>;
}

function Track({ windows, start, end, current, body }: { windows: Window[]; start: number; end: number; current: string; body: keyof typeof colors }) {
  const { t } = useLanguage();
  const name = body === "both" ? "Overlap" : body === "sun" ? "Sun" : "Earth";
  const fraction = (time: string) => (Date.parse(time) - start) / (end - start) * 100;
  return <div className="track-row"><span>{t(name)}</span><div className="track"
    role="img" aria-label={`${t(name)} · ${windows.length} ${t("Visibility windows").toLowerCase()}`}>
    {windows.map((w) => <span key={w.start_utc}
      title={`${w.start_utc} / ${w.end_utc}`}
      style={{ left: `${fraction(w.start_utc)}%`, width: `${fraction(w.end_utc) - fraction(w.start_utc)}%`, backgroundColor: colors[body] }} />)}
    <i className="track-cursor" style={{ left: `clamp(0px, ${fraction(current)}%, calc(100% - 1px))` }} aria-hidden />
  </div></div>;
}

export function Timeline({ result, active }: { result: Result; active: number }) {
  const start = Date.parse(result.start_utc), end = Date.parse(result.end_utc);
  return <div className="timeline">
    {(["sun", "earth", "both"] as const).map((body) => <Track key={body}
      body={body} windows={result.windows[body]} start={start} end={end} current={result.samples[active].time_utc} />)}
    <div className="timeline-axis">{[start, (start + end) / 2, end].map((time) =>
      <span key={time}>{tickLabel(time, end - start)}</span>)}</div>
  </div>;
}
