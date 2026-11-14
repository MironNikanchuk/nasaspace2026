"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Group, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OrthographicCamera, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3,
} from "three";
import {
  circlePoints, disposeScene, loadPlanet, localDirection, moonDirection,
  planetRenderer, positionDirection, terrainProfile,
} from "@/lib/lunar-scene";
import { connectCamera, type CameraFrame } from "@/lib/camera-motion";
import type { Result, Sample, Site } from "@/lib/types";
import styles from "./mission-scene.module.css";

const SUN_COLOR = "#edbf78";
const EARTH_COLOR = "#a8c9df";
const BODIES = ["sun", "earth"] as const;
const BODY_NAMES = { sun: "Sun", earth: "Earth" };
const SKY_RADIUS = 21;
const HORIZON_RADIUS = 11;
const MOON_ASSET = "/media/nasa-moon.glb";
const EARTH_ASSET = "/media/nasa-earth.glb";
const HOME_CAMERA: CameraFrame = { yaw: 0, pitch: 0, zoom: 1, x: 0, y: 0 };
const LOLA_ASSET = "/media/lola-pole.webp";

type Body = typeof BODIES[number];

function skyPoint(vector: Vector3, camera: PerspectiveCamera | OrthographicCamera) {
  const projected = vector.clone().project(camera);
  return {
    x: 50 + projected.x * 50,
    y: 50 - projected.y * 50,
    onscreen: Math.abs(projected.x) < .94 && Math.abs(projected.y) < .9 && Math.abs(projected.z) < 1,
  };
}

function relativeAzimuth(angle: number, center: number) {
  return ((angle - center + 540) % 360) - 180;
}

function terrainElevation(azimuth: number, profile?: readonly number[]) {
  if (!profile) return 0;
  const index = ((azimuth + 360) % 360) * profile.length / 360;
  const lo = Math.floor(index);
  return profile[lo] + (index - lo) * (profile[(lo + 1) % profile.length] - profile[lo]);
}

function SkyDiagram({ sample, focus, profile }: {
  sample: Sample; focus: Body; profile?: readonly number[];
}) {
  const center = sample[focus].azimuth_deg;
  const top = Math.max(24, sample[focus].elevation_deg + 9, sample[focus].horizon_elevation_deg + 6);
  const bottom = Math.min(-21, sample[focus].elevation_deg - 9);
  const x = (azimuth: number) => 300 + relativeAzimuth(azimuth, center) * 8;
  const y = (elevation: number) => (top - elevation) * 240 / (top - bottom);
  const silhouette = Array.from({ length: 76 }, (_, i) => {
    const angle = center + i - 37.5;
    return `${i ? "L" : "M"}${(i * 8).toFixed(2)} ${y(terrainElevation(angle, profile)).toFixed(2)}`;
  }).join(" ");
  return <svg aria-hidden="true" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice">
    <rect width="600" height="240" fill="#10120f" />
    {[15, 0, -15].map((elevation) => <g key={elevation}>
      <line x1="0" x2="600" y1={y(elevation)} y2={y(elevation)} stroke="#61635b" strokeOpacity={elevation ? ".2" : ".7"} />
      <text x="10" y={y(elevation) - 6} fill="#babcb3" fontSize="10">{elevation}°</text>
    </g>)}
    <path d={silhouette + " L 600 240 L 0 240 Z"} fill="#252821" opacity=".9" />
    <path d={silhouette} stroke="#a2a799" strokeWidth="1.4" fill="none" />
    {BODIES.map((body) => {
      const p = sample[body];
      if (Math.abs(relativeAzimuth(p.azimuth_deg, center)) > 34 || p.elevation_deg > top || p.elevation_deg < bottom) return null;
      const color = body === "sun" ? SUN_COLOR : EARTH_COLOR;
      return <g key={body} opacity={p.above_horizon ? 1 : .75}>
        <line x1={x(p.azimuth_deg)} x2={x(p.azimuth_deg)} y1={y(p.elevation_deg)}
          y2={y(p.horizon_elevation_deg)} stroke={color} strokeDasharray="3 4" strokeOpacity=".6" />
        <circle cx={x(p.azimuth_deg)} cy={y(p.elevation_deg)} r="5" fill={p.above_horizon ? color : "#171a15"}
          stroke={color} strokeWidth="1.4" />
        <text x={x(p.azimuth_deg) + 12} y={y(p.elevation_deg) + 3} fill={color} fontSize="12">{BODY_NAMES[body]}</text>
      </g>;
    })}
  </svg>;
}

function makeHorizon(profile?: readonly number[]) {
  const elevations = profile ?? Array.from({ length: 180 }, () => 0);
  const edge = elevations.map((elevation, index) => localDirection(
    index * 360 / elevations.length, elevation, HORIZON_RADIUS,
  ));
  const geometry = new BufferGeometry();
  const faces = edge.flatMap((position, index) => {
    const next = edge[(index + 1) % edge.length];
    const base = new Vector3(position.x, -35, position.z);
    const nextBase = new Vector3(next.x, -35, next.z);
    return [...position, ...base, ...next, ...next, ...base, ...nextBase];
  });
  geometry.setAttribute("position", new Float32BufferAttribute(faces, 3));
  const edgeColor = new Color("#3e4541");
  const baseColor = new Color("#141916");
  const colors = edge.flatMap(() => [...edgeColor, ...baseColor, ...edgeColor, ...edgeColor, ...baseColor, ...baseColor]);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const group = new Group();
  group.add(
    new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })),
    new LineLoop(new BufferGeometry().setFromPoints(edge), new LineBasicMaterial({ color: "#d3d9cf" })),
  );
  return group;
}

function setLine(line: Line, a: Vector3, b: Vector3) {
  const points = line.geometry.getAttribute("position");
  points.setXYZ(0, a.x, a.y, a.z);
  points.setXYZ(1, b.x, b.y, b.z);
  points.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function occlusionMarker(color: string) {
  const points = Array.from({ length: 41 }, (_, index) => {
    const angle = index / 40 * 2 * Math.PI;
    return new Vector3(.62 * Math.cos(angle), .62 * Math.sin(angle), 0);
  });
  const marker = new Line(
    new BufferGeometry().setFromPoints(points),
    new LineDashedMaterial({ color, opacity: .75, transparent: true, depthTest: false, dashSize: .12, gapSize: .075 }),
  );
  marker.renderOrder = 4;
  marker.computeLineDistances();
  return marker;
}

function BodyReading({ body, sample }: { body: Body; sample: Sample }) {
  const value = sample[body];
  const margin = value.elevation_deg - value.horizon_elevation_deg;
  const color = body === "sun" ? SUN_COLOR : EARTH_COLOR;
  return <div className={styles.reading}>
    <strong>{BODY_NAMES[body]} <small style={{ color }}>{value.above_horizon ? "Visible" : "Below horizon"}</small></strong>
    <b>{value.azimuth_deg.toFixed(1)}° az · {value.elevation_deg.toFixed(1)}° el</b>
    <small>{margin >= 0 ? "+" : "−"}{Math.abs(margin).toFixed(2)}° from modeled horizon</small>
  </div>;
}

export function MissionScene({ result, sample }: { result: Result; sample: Sample }) {
  const [focus, setFocus] = useState<Body>("earth");
  const [webgl, setWebgl] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof connectCamera> | null>(null);
  const cameraFrame = useRef(HOME_CAMERA);
  const labels = useRef<Partial<Record<Body, HTMLSpanElement>>>({});
  const redraw = useRef<(() => void) | undefined>(undefined);
  const state = useRef({ sample, focus });
  const profile = result.model.horizon === "terrain" ? terrainProfile(result.site.id) : undefined;

  useEffect(() => {
    const element = canvas.current;
    if (!element || !surface.current) return;
    const renderer = planetRenderer(element);
    if (!renderer) return;
    cameraFrame.current = HOME_CAMERA;
    let closed = false;
    const scene = new Scene();
    const camera = new PerspectiveCamera(43, 1, .05, 80);
    const light = new DirectionalLight("#fff4db", 2.6);
    scene.add(new AmbientLight("#b3c9e2", 1.2), light, makeHorizon(profile));
    [15, 0, -15].forEach((elevation) => {
      const material = new LineDashedMaterial({ color: "#9aa59c", opacity: elevation ? .22 : .62, transparent: true, depthTest: false, dashSize: .12, gapSize: .1 });
      const ring = new LineLoop(new BufferGeometry().setFromPoints(circlePoints(12, elevation)), material);
      ring.computeLineDistances();
      ring.renderOrder = 2;
      scene.add(ring);
    });

    const sun = new Mesh(new SphereGeometry(.56, 24, 16), new MeshBasicMaterial({ color: SUN_COLOR }));
    const earth = new Group();
    const placeholder = new Mesh(new SphereGeometry(.77, 26, 18), new MeshStandardMaterial({ color: EARTH_COLOR, roughness: 1 }));
    earth.add(placeholder);
    scene.add(sun, earth);

    const indicators = BODIES.map((body) => {
      const color = body === "sun" ? SUN_COLOR : EARTH_COLOR;
      const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(6, 3));
      const line = new Line(geometry, new LineBasicMaterial({ color, transparent: true, opacity: .43, depthTest: false }));
      line.renderOrder = 3;
      scene.add(line);
      return line;
    });
    const blocked = [occlusionMarker(SUN_COLOR), occlusionMarker(EARTH_COLOR)];
    scene.add(...blocked);

    const compass = surface.current.querySelector<HTMLElement>("[data-compass]");
    const draw = () => {
      const { sample: current, focus: target } = state.current;
      const { azimuth_deg: az, elevation_deg: el, horizon_elevation_deg: edge } = current[target];
      const { yaw, pitch, zoom } = cameraFrame.current;
      const heading = az - yaw;
      camera.fov = Math.max(30, Math.abs(el - edge) + 9) / zoom;
      camera.updateProjectionMatrix();
      camera.lookAt(localDirection(heading, Math.max(-80, Math.min(80, (el + edge) / 2 + pitch))));
      if (compass) compass.textContent = `${((Math.round(heading) % 360) + 360) % 360}° az`;
      camera.updateMatrixWorld();
      sun.position.copy(positionDirection(current.sun, SKY_RADIUS));
      earth.position.copy(positionDirection(current.earth, SKY_RADIUS));
      light.position.copy(positionDirection(current.sun, 100));
      sun.visible = current.sun.above_horizon;
      earth.visible = current.earth.above_horizon;
      for (const [index, body] of BODIES.entries()) {
        const p = current[body];
        const point = positionDirection(p, SKY_RADIUS);
        blocked[index].visible = !p.above_horizon;
        blocked[index].position.copy(point);
        blocked[index].quaternion.copy(camera.quaternion);
        setLine(indicators[index], localDirection(p.azimuth_deg, p.elevation_deg, 12), localDirection(p.azimuth_deg, p.horizon_elevation_deg, 12));
        const label = labels.current[body];
        if (!label) continue;
        const screen = skyPoint(point, camera);
        label.hidden = !screen.onscreen;
        label.style.left = `${screen.x}%`;
        label.style.top = `${screen.y}%`;
      }
      renderer.render(scene, camera);
    };
    redraw.current = draw;
    const interaction = connectCamera(surface.current, (frame) => {
      cameraFrame.current = frame;
      draw();
    });
    controls.current = interaction;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const unavailable = () => setWebgl(false);
    element.addEventListener("webglcontextlost", unavailable);
    resize();
    setWebgl(true);

    void loadPlanet(EARTH_ASSET, .8).then((planet) => {
      if (closed) { disposeScene(planet); return; }
      earth.remove(placeholder);
      disposeScene(placeholder);
      earth.add(planet);
      draw();
    }).catch(() => { /* The globe silhouette remains available. */ });

    return () => {
      closed = true;
      interaction.dispose();
      controls.current = null;
      observer.disconnect();
      element.removeEventListener("webglcontextlost", unavailable);
      redraw.current = undefined;
      disposeScene(scene);
      renderer.dispose();
    };
  }, [profile]);

  useEffect(() => {
    state.current = { sample, focus };
    redraw.current?.();
  }, [sample, focus]);

  return <figure className={styles.figure} aria-label={`Local sky at ${result.site.name}`}>
    <div className={styles.toolbar}>
      <div className={styles.location}><strong>Horizon view</strong><span>{sample.time_utc.slice(0, 16).replace("T", " ")} UTC · {result.site.name}</span></div>
      <div className={styles.switches} aria-label="Point camera toward">
        {BODIES.map((body) => <button key={body} type="button" aria-pressed={focus === body}
          onClick={() => { setFocus(body); controls.current?.reset(); }}>{BODY_NAMES[body]}</button>)}
        {webgl && <button type="button" onClick={() => controls.current?.reset()}>Recenter</button>}
      </div>
    </div>
    <div ref={surface} className={`${styles.viewport} ${styles.sky} ${webgl ? styles.ready : ""}`}
      tabIndex={webgl ? 0 : undefined} role="group" aria-label="Horizon camera. Drag or use arrow keys to look around. Plus and minus zoom.">
      <div className={styles.fallback}>
        <SkyDiagram sample={sample} focus={focus} profile={profile} />
      </div>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.labels} aria-hidden="true" hidden={!webgl}>
        {BODIES.map((body) => <span key={body} ref={(node) => { if (node) labels.current[body] = node; }}
          className={styles.bodyLabel}
          style={{ color: body === "sun" ? SUN_COLOR : EARTH_COLOR }}>
          {BODY_NAMES[body]}{sample[body].above_horizon ? "" : " · below horizon"}
        </span>)}
      </div>
      <span className={styles.compass} data-compass>{Math.round(sample[focus].azimuth_deg) % 360}° az</span>
      <div className={styles.horizonStatus}>
        <strong>{BODY_NAMES[focus]} {sample[focus].above_horizon ? "visible" : "below horizon"}</strong>
        <span>{sample[focus].elevation_deg.toFixed(2)}° elevation · {sample[focus].horizon_elevation_deg.toFixed(2)}° horizon</span>
      </div>
      {webgl && <div className={styles.cameraTools}>
        <button type="button" aria-label="Zoom in" onClick={() => controls.current?.zoom(1.24)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => controls.current?.zoom(1 / 1.24)}>−</button>
      </div>}
    </div>
    <div className={styles.sceneKey}>
      <span><b className={styles.lineKey} />{profile ? "LOLA terrain" : "Geometric horizon"}</span>
      {profile && <span><b className={styles.zeroKey} />0° horizontal</span>}
      <span><b className={styles.hiddenKey} />Body hidden by the horizon</span>
      {webgl && <span>Drag to look around · focus to zoom</span>}
    </div>
    <div className={styles.readings}>{BODIES.map((body) => <BodyReading key={body} body={body} sample={sample} />)}</div>
    <figcaption>{profile ? "NASA LOLA angular horizon" : "Geometric horizon at 0°"} · Body sizes and distances are illustrative</figcaption>
  </figure>;
}

type GlobeView = "pole" | "moon";

function polarSurface() {
  const resolution = 64;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= resolution; row++) {
    for (let col = 0; col <= resolution; col++) {
      const u = col / resolution, v = 1 - row / resolution;
      // Invert the source stereographic projection on NASA's 1,737.4 km reference sphere.
      const east = (u - .5) * 330_000;
      const north = (v - .5) * 330_000;
      const latitude = (2 * Math.atan2(Math.hypot(east, north), 2 * 1_737_400)) * 180 / Math.PI - 90;
      const longitude = Math.atan2(east, north) * 180 / Math.PI;
      const vector = moonDirection(latitude, longitude, 1.0015);
      positions.push(vector.x, vector.y, vector.z);
      uvs.push(u, v);
      if (row < resolution && col < resolution) {
        const vertex = row * (resolution + 1) + col;
        indices.push(vertex, vertex + resolution + 1, vertex + 1,
          vertex + 1, vertex + resolution + 1, vertex + resolution + 2);
      }
    }
  }
  const geometry = new BufferGeometry()
    .setAttribute("position", new Float32BufferAttribute(positions, 3))
    .setAttribute("uv", new Float32BufferAttribute(uvs, 2))
    .setIndex(indices);
  return new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide, color: "#b9b8af" }));
}

function radialCoordinates(sites: Site[]) {
  return sites.map((site) => ({
    site,
    vector: moonDirection(site.latitude_deg, site.longitude_east_deg),
  }));
}

export function LunarGlobe({ sites, selectedId, onSelect, assignments, hero = false }: {
  sites: Site[]; selectedId?: string; onSelect?: (id: string) => void;
  assignments?: readonly [string | undefined, string | undefined];
  hero?: boolean;
}) {
  const [view, setView] = useState<GlobeView>(hero ? "moon" : "pole");
  const [webgl, setWebgl] = useState(false);
  const [panning, setPanning] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof connectCamera> | null>(null);
  const cameraFrame = useRef(HOME_CAMERA);
  const tokens = useRef<Record<string, HTMLButtonElement | null>>({});
  const anchors = useRef<Record<string, HTMLSpanElement | null>>({});
  const leaders = useRef<Record<string, HTMLSpanElement | null>>({});
  const redraw = useRef<(() => void) | undefined>(undefined);
  const sitesRef = useRef(sites);
  const viewRef = useRef(view);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !surface.current) return;
    const renderer = planetRenderer(element);
    if (!renderer) return;
    let closed = false;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1.3, 1.3, 1.3, -1.3, .1, 12);
    const key = new DirectionalLight("#fff4e4", 3);
    key.position.set(-2, -3, 4);
    scene.add(key, new AmbientLight("#faf4eb", 1.55));

    const graticule = new Group();
    const gridMaterial = new LineBasicMaterial({ color: "#e5dfcd", transparent: true, opacity: .38 });
    for (const latitude of [-88, -86, -84, -82]) {
      const points = Array.from({ length: 120 }, (_, index) => moonDirection(latitude, index * 3, 1.0025));
      graticule.add(new LineLoop(new BufferGeometry().setFromPoints(points), gridMaterial));
    }
    for (const longitude of [0, 90, 180, 270]) {
      const points = Array.from({ length: 24 }, (_, index) => moonDirection(-90 + index * .5, longitude, 1.003));
      graticule.add(new Line(new BufferGeometry().setFromPoints(points), gridMaterial));
    }
    scene.add(graticule);
    const polarMap = polarSurface();
    polarMap.visible = false;
    scene.add(polarMap);

    const draw = () => {
      const pole = viewRef.current === "pole";
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const aspect = width / height;
      const { yaw, pitch, zoom, x, y } = cameraFrame.current;
      const vertical = (pole ? .092 : Math.max(1.16, 1.12 / aspect)) / zoom;
      const horizontal = vertical * aspect;
      camera.left = -horizontal - x * horizontal * 2;
      camera.right = horizontal - x * horizontal * 2;
      camera.top = vertical + y * vertical * 2;
      camera.bottom = -vertical + y * vertical * 2;
      const latitude = pole ? -90 + Math.min(35, Math.abs(pitch) / 3) : Math.max(-87, Math.min(87, -24 + pitch));
      const longitude = (pole ? (pitch > 0 ? 180 : 0) : 16) - yaw;
      camera.position.copy(moonDirection(latitude, longitude, 4));
      camera.up.copy(pole
        ? moonDirection(0, -yaw)
        : new Vector3(0, 1, 0));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      graticule.visible = pole;
      polarMap.visible = pole && Boolean(polarMap.material.map);

      const controls: { x: number; y: number }[] = [];
      for (const { site, vector } of radialCoordinates(sitesRef.current)) {
        const anchor = anchors.current[site.id];
        const token = tokens.current[site.id];
        const leader = leaders.current[site.id];
        if (!anchor || !token || !leader) continue;
        const screen = skyPoint(vector, camera);
        const visible = screen.onscreen && vector.dot(camera.position) > 0;
        anchor.hidden = token.hidden = leader.hidden = !visible;
        if (!visible) continue;
        anchor.style.left = `${screen.x}%`;
        anchor.style.top = `${screen.y}%`;
        const x = screen.x / 100 * width;
        const y = screen.y / 100 * height;
        const outward = screen.x < 52 ? -1 : 1;
        const labelX = Math.min(width - 22, Math.max(22, x + outward * 25));
        const offsets = [0, -30, 30, -60, 60];
        const labelY = offsets.map((offset) => Math.min(height - 17, Math.max(17, y + offset)))
          .find((candidate) => controls.every((p) => Math.hypot(labelX - p.x, candidate - p.y) >= 29)) ?? y;
        controls.push({ x: labelX, y: labelY });
        token.style.left = `${labelX}px`;
        token.style.top = `${labelY}px`;
        leader.style.left = `${x}px`;
        leader.style.top = `${y}px`;
        leader.style.width = `${Math.hypot(labelX - x, labelY - y)}px`;
        leader.style.transform = `rotate(${Math.atan2(labelY - y, labelX - x)}rad)`;
      }
      renderer.render(scene, camera);
    };
    redraw.current = draw;
    const interaction = connectCamera(surface.current, (frame) => {
      cameraFrame.current = frame;
      draw();
    }, { pan: true });
    controls.current = interaction;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const unavailable = () => setWebgl(false);
    element.addEventListener("webglcontextlost", unavailable);

    void loadPlanet(MOON_ASSET, 1).then((moon) => {
      if (closed) { disposeScene(moon); return; }
      scene.add(moon);
      resize();
      setWebgl(true);
    }).catch(() => { /* Keep the map fallback and site controls accessible. */ });
    if (!hero) void new TextureLoader().loadAsync(LOLA_ASSET).then((texture) => {
      if (closed) { texture.dispose(); return; }
      texture.colorSpace = SRGBColorSpace;
      polarMap.material.map = texture;
      polarMap.material.needsUpdate = true;
      draw();
    }).catch(() => { /* The calibrated NASA globe remains available. */ });

    return () => {
      closed = true;
      interaction.dispose();
      controls.current = null;
      observer.disconnect();
      element.removeEventListener("webglcontextlost", unavailable);
      redraw.current = undefined;
      disposeScene(scene);
      renderer.dispose();
    };
  }, [hero]);

  useEffect(() => {
    sitesRef.current = sites;
    viewRef.current = view;
    redraw.current?.();
  }, [sites, view]);

  return <figure className={styles.figure} aria-label={hero ? "Interactive 3D Moon" : "Interactive lunar landing site map"}>
    {!hero && <div className={styles.toolbar}>
      <div className={styles.location}><strong>Lunar surface</strong><span>{view === "pole" ? "South polar view" : "Nearside overview"}</span></div>
      <div className={styles.switches} aria-label="Globe camera">
        <button type="button" aria-pressed={view === "pole"} onClick={() => { controls.current?.reset(); setView("pole"); }}>South pole</button>
        <button type="button" aria-pressed={view === "moon"} onClick={() => { controls.current?.reset(); setView("moon"); }}>Full Moon</button>
      </div>
    </div>}
    <div ref={surface} data-panning={panning} className={`${styles.viewport} ${styles.globeViewport} ${hero ? styles.heroGlobe : ""} ${webgl ? styles.ready : ""}`}
      tabIndex={webgl ? 0 : undefined} role="group" aria-label="Moon camera. Drag or use arrows to rotate. Shift and drag to pan. Plus and minus zoom.">
      <div className={styles.fallback}>
        <div className={styles.fallbackOptions}>
          {sites.map((site, index) => <button key={site.id} type="button" aria-pressed={selectedId === site.id}
            onClick={() => onSelect?.(site.id)}>{index + 1} · {site.name}</button>)}
        </div>
      </div>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.labels} hidden={!webgl}>
        {sites.map((site, index) => <div key={site.id}>
          <span className={styles.anchor} aria-hidden ref={(node) => { anchors.current[site.id] = node; }} />
          <span className={styles.leader} aria-hidden ref={(node) => { leaders.current[site.id] = node; }} />
          <button ref={(node) => { tokens.current[site.id] = node; }} type="button"
            className={styles.marker} aria-label={`Select ${site.name}`} title={site.name}
            aria-pressed={selectedId === site.id} onClick={() => onSelect?.(site.id)}>
            {assignments?.[0] === site.id ? (assignments[1] === site.id ? "A/B" : "A")
              : assignments?.[1] === site.id ? "B" : index + 1}
          </button>
        </div>)}
      </div>
      {webgl && <div className={styles.cameraTools}>
        {!hero && <button type="button" aria-pressed={panning} onClick={() => setPanning(!panning)}>Pan</button>}
        <button type="button" aria-label="Zoom in" onClick={() => controls.current?.zoom(1.24)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => controls.current?.zoom(1 / 1.24)}>−</button>
        <button type="button" onClick={() => controls.current?.reset()}>Reset view</button>
      </div>}
      {!hero && <span className={styles.compass}>{view === "pole" ? "South polar region" : "Lunar globe"}</span>}
    </div>
    <figcaption>
      {!hero && "Site coordinates in MEAN_ME · "}<a href="https://solarsystem.nasa.gov/gltf_embed/2366/">NASA Moon model</a>
      {webgl && " · Drag to rotate"}
      {view === "pole" && <> · <a href="https://pgda.gsfc.nasa.gov/products/90">NASA LOLA reference hillshade</a></>}
    </figcaption>
  </figure>;
}
