"use client";

import { useLanguage } from "./language";
import { useId } from "react";
import type { Result, Sample, Window } from "@/lib/types";

const colors = { sun: "var(--sun)", earth: "var(--earth)", both: "var(--overlap)" };
const tickText = new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });

export function utcLabel(value: string) {
  return value.slice(0, 16).replace("T", " ") + " UTC";
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
  const ticks = Array.from({ length: 5 }, (_, i) => start + (end - start) * i / 4);
  const angles = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * i / 4);
  return <svg className="elevation-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}
    onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = (event.clientX - rect.left) / rect.width * width;
      const timestamp = start + (scale - left) / (width - left - right) * (end - start);
      const closest = samples.reduce((best, sample, index) =>
        Math.abs(Date.parse(sample.time_utc) - timestamp) < Math.abs(Date.parse(samples[best].time_utc) - timestamp) ? index : best, 0);
      select(closest);
    }}>
    <title id={id}>{result.site.name} elevation and horizon over the selected period</title>
    {angles.map((angle) => <g key={angle}><line x1={left} x2={width - right} y1={y(angle)} y2={y(angle)} className="chart-grid" />
      <text x={left - 8} y={y(angle) + 4} textAnchor="end">{Number(angle.toFixed(1))}°</text></g>)}
    {ticks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} className="chart-grid" />
      <text x={x(tick)} y={height - 10} textAnchor={tick === start ? "start" : tick === end ? "end" : "middle"}>{end - start >= 86_400_000 ? tickText.format(tick) : new Date(tick).toISOString().slice(11, 16)}</text></g>)}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero" />
    {result.model.horizon === "terrain" && (["sun", "earth"] as const).map((body) =>
      <path key={body} d={path((s) => s[body].horizon_elevation_deg)} stroke={colors[body]} strokeDasharray="3 4" opacity=".52" fill="none" />)}
    {(["sun", "earth"] as const).map((body) =>
      <path key={body} d={path((s) => s[body].elevation_deg)} stroke={colors[body]} strokeWidth="1.9"
        strokeDasharray={body === "earth" ? "6 3" : undefined} fill="none" vectorEffect="non-scaling-stroke" />)}
    <line x1={cursorX} x2={cursorX} y1={top} y2={height - bottom} className="chart-cursor" />
    {(["sun", "earth"] as const).map((body) =>
      <circle key={body} cx={cursorX} cy={y(selected[body].elevation_deg)} r="3.2" fill={colors[body]} />)}
  </svg>;
}

function Track({ windows, start, end, body }: { windows: Window[]; start: number; end: number; body: keyof typeof colors }) {
  const { t } = useLanguage();
  const name = body === "both" ? "Overlap" : body === "sun" ? "Sun" : "Earth";
  const fraction = (time: string) => (Date.parse(time) - start) / (end - start) * 100;
  return <div className="track-row"><span>{t(name)}</span><div className="track"
    role="img" aria-label={`${name}: ${windows.length} visibility windows`}>
    {windows.map((w) => <span key={w.start_utc}
      title={`${w.start_utc.slice(0, 19).replace("T", " ")} → ${w.end_utc.slice(0, 19).replace("T", " ")} UTC`}
      style={{ left: `${fraction(w.start_utc)}%`, width: `${fraction(w.end_utc) - fraction(w.start_utc)}%`, backgroundColor: colors[body] }} />)}
  </div></div>;
}

export function Timeline({ result }: { result: Result }) {
  return <div className="timeline">{(["sun", "earth", "both"] as const).map((body) =>
    <Track key={body} body={body} windows={result.windows[body]} start={Date.parse(result.start_utc)} end={Date.parse(result.end_utc)} />)}</div>;
}
