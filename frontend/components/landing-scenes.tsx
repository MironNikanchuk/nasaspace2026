"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Position, Sample } from "@/lib/types";
import styles from "@/app/landing.module.css";

const LunarGlobe = dynamic(() => import("./mission-scene").then((module) => module.LunarGlobe), {
  ssr: false,
  loading: () => <div className={styles.moonPoster} role="status">Loading the 3D Moon…</div>,
});
const noSites: [] = [];

export function HeroMoon() {
  return <LunarGlobe sites={noSites} hero />;
}

type TerrainFrame = { time: Sample["time_utc"]; earth: Position };

export function TerrainAnimation({ frames }: { frames: TerrainFrame[] }) {
  const first = Math.max(0, frames.findIndex(({ earth }) =>
    earth.elevation_deg > 0 && !earth.above_horizon));
  const [index, setIndex] = useState(first);
  const [terrain, setTerrain] = useState(true);
  const [playing, setPlaying] = useState(false);
  const frame = frames[index];
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % frames.length), 135);
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);

  useEffect(() => {
    if (!playing) return;
    const node = svg.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setPlaying(false); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [playing]);

  const y = (degrees: number) => Math.max(30, Math.min(218, 139 - degrees * 26));
  const height = terrain ? frame.earth.horizon_elevation_deg : 0;
  const earthY = y(frame.earth.elevation_deg);
  const ridgeY = y(height);
  const visible = terrain ? frame.earth.above_horizon : frame.earth.elevation_deg > 0;
  const ridge = `M 0 ${ridgeY + (terrain ? 62 : 0)} Q 108 ${ridgeY + (terrain ? 56 : 0)} 201 ${ridgeY + (terrain ? 10 : 0)} T 306 ${ridgeY} Q 415 ${ridgeY + (terrain ? 10 : 0)} 600 ${ridgeY + (terrain ? 43 : 0)}`;
  return <figure className={styles.terrainDemo} aria-label="Animated Earth visibility at Connecting Ridge">
    <div className={styles.terrainHead}>
      <span>Connecting Ridge</span>
      <strong className={visible ? styles.visible : styles.occluded}>{visible ? "Earth visible" : "Earth hidden"}</strong>
    </div>
    <svg ref={svg} viewBox="0 0 600 244" className={styles.terrainSky} role="img"
      aria-label={`Earth elevation ${frame.earth.elevation_deg.toFixed(2)}°, horizon elevation ${height.toFixed(2)}°`}>
      <defs>
        <linearGradient id="ridge-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#454943" /><stop offset="1" stopColor="#141817" />
        </linearGradient>
      </defs>
      <path d={ridge + " L 600 244 L 0 244 Z"} fill="url(#ridge-fill)" opacity=".94" />
      <path d={ridge} fill="none" stroke="#c7c9bb" strokeWidth="1.5" />
      <line x1="0" y1={y(0)} x2="600" y2={y(0)} stroke="#d5d8d2" strokeDasharray="5 6" opacity=".58" />
      <text x="18" y={y(0) + 20} fill="#edeee4" fontSize="16">0° horizontal</text>
      <line x1="306" x2="306" y1={earthY} y2={ridgeY} stroke="#abdafa" strokeDasharray="3 4" />
      <g className={styles.earthMotion} style={{ transform: `translate(306px, ${earthY}px)` }}>
        {visible
          ? <circle r="9" fill="#a8dafa" stroke="#e3f4ff" strokeWidth="1.5" />
          : <circle r="9" fill="#202723" stroke="#a8dafa" strokeWidth="1.5" strokeDasharray="4 3" />}
        <text x="16" y="-12" fill="#d3ecff" fontSize="17">Earth</text>
      </g>
    </svg>
    <div className={styles.terrainReadings}>
      <span>Earth elevation <strong>{frame.earth.elevation_deg.toFixed(2)}°</strong></span>
      <span>Horizon at Earth’s azimuth <strong>{height.toFixed(2)}°</strong></span>
    </div>
    <div className={styles.terrainControls}>
      <div className="segmented" aria-label="Horizon model">
        <button type="button" aria-pressed={!terrain} onClick={() => setTerrain(false)}>Geometric</button>
        <button type="button" aria-pressed={terrain} onClick={() => setTerrain(true)}>LOLA terrain</button>
      </div>
      <button className="button button-small" type="button" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
    </div>
    <label className={styles.terrainTime}>
      <span>{frame.time.slice(0, 16).replace("T", " ")} UTC</span>
      <input aria-label="Terrain example time" aria-valuetext={frame.time} type="range"
        min={0} max={frames.length - 1} value={index}
        onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }} />
    </label>
    <figcaption>Illustrated ridge profile · Angles from <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a> and <a href="https://pgda.gsfc.nasa.gov/products/90">NASA LOLA</a></figcaption>
  </figure>;
}
