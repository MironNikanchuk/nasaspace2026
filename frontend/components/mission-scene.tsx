"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Group, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OrthographicCamera, PerspectiveCamera, Scene, SphereGeometry, Vector3,
} from "three";
import {
  circlePoints, disposeScene, loadPlanet, localDirection, moonDirection,
  planetRenderer, positionDirection, terrainProfile,
} from "@/lib/lunar-scene";
import { connectCamera, type CameraFrame } from "@/lib/camera-motion";
import { loadPolarRelief } from "@/lib/polar-relief";
import { ViewMode, type SceneMode } from "./view-mode";
import { MaterialSymbol } from "./material-symbol";
import { useLanguage } from "./language";
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
  const { t } = useLanguage();
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
        <text x={x(p.azimuth_deg) + 12} y={y(p.elevation_deg) + 3} fill={color} fontSize="12">{t(BODY_NAMES[body])}</text>
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
  const { t } = useLanguage();
  const value = sample[body];
  const margin = value.elevation_deg - value.horizon_elevation_deg;
  const color = body === "sun" ? SUN_COLOR : EARTH_COLOR;
  return <div className={styles.reading}>
    <strong>{t(BODY_NAMES[body])} <small style={{ color }}>{t(value.above_horizon ? "Visible" : "Below horizon")}</small></strong>
    <b>{value.azimuth_deg.toFixed(1)}° az · {value.elevation_deg.toFixed(1)}° el</b>
    <small>{margin >= 0 ? "+" : "−"}{Math.abs(margin).toFixed(2)}° from modeled horizon</small>
  </div>;
}

export function MissionScene({ result, sample }: { result: Result; sample: Sample }) {
  const { t } = useLanguage();
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
      <div className={styles.location}><strong>{t("Horizon view")}</strong><span>{sample.time_utc.slice(0, 16).replace("T", " ")} UTC · {result.site.name}</span></div>
      <div className={styles.switches} aria-label={t("Point camera toward")}>
        {BODIES.map((body) => <button key={body} type="button" aria-pressed={focus === body}
          onClick={() => { setFocus(body); controls.current?.reset(); }}>{t(BODY_NAMES[body])}</button>)}
        {webgl && <button type="button" onClick={() => controls.current?.reset()}>{t("Recenter")}</button>}
      </div>
    </div>
    <div ref={surface} className={`${styles.viewport} ${styles.sky} ${webgl ? styles.ready : ""}`}
      tabIndex={webgl ? 0 : undefined} role="group" aria-label={t("Horizon camera. Drag or use arrow keys to look around. Plus and minus zoom.")}>
      <div className={styles.fallback}>
        <SkyDiagram sample={sample} focus={focus} profile={profile} />
      </div>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.labels} aria-hidden="true" hidden={!webgl}>
        {BODIES.map((body) => <span key={body} ref={(node) => { if (node) labels.current[body] = node; }}
          className={styles.bodyLabel}
          style={{ color: body === "sun" ? SUN_COLOR : EARTH_COLOR }}>
          {t(BODY_NAMES[body])}{sample[body].above_horizon ? "" : " · " + t("Below horizon")}
        </span>)}
      </div>
      <span className={styles.compass} data-compass>{Math.round(sample[focus].azimuth_deg) % 360}° az</span>
      <div className={styles.horizonStatus}>
        <strong>{t(BODY_NAMES[focus])} {t(sample[focus].above_horizon ? "Visible" : "Below horizon")}</strong>
        <span>{sample[focus].elevation_deg.toFixed(2)}° elevation · {sample[focus].horizon_elevation_deg.toFixed(2)}° horizon</span>
      </div>
      {webgl && <div className={styles.cameraTools}>
        <button type="button" aria-label={t("Zoom in")} onClick={() => controls.current?.zoom(1.24)}>+</button>
        <button type="button" aria-label={t("Zoom out")} onClick={() => controls.current?.zoom(1 / 1.24)}>−</button>
      </div>}
    </div>
    <div className={styles.sceneKey}>
      <span><b className={styles.lineKey} />{profile ? "LOLA terrain" : "Geometric horizon"}</span>
      {profile && <span><b className={styles.zeroKey} />0° horizontal</span>}
      <span><b className={styles.hiddenKey} />{t("Body hidden by the horizon")}</span>
      {webgl && <span>{t("Drag to look around · focus to zoom")}</span>}
    </div>
    <div className={styles.readings}>{BODIES.map((body) => <BodyReading key={body} body={body} sample={sample} />)}</div>
    <figcaption>{t(profile ? "NASA LOLA angular horizon" : "Geometric horizon at 0°")} · {t("Body sizes and distances are illustrative")}</figcaption>
  </figure>;
}

type GlobeView = "pole" | "moon";

export function LunarGlobe({ sites, selectedId, onSelect, assignments, hero = false }: {
  sites: Site[]; selectedId?: string; onSelect?: (id: string) => void;
  assignments?: readonly [string | undefined, string | undefined];
  hero?: boolean;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState<GlobeView>(hero ? "moon" : "pole");
  const [webgl, setWebgl] = useState(false);
  const [panning, setPanning] = useState(false);
  const [poleMode, setPoleMode] = useState<SceneMode>("3d");
  const [hasRelief, setHasRelief] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [reliefFailed, setReliefFailed] = useState(false);
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
  const poleModeRef = useRef(poleMode);
  const idleRotation = useRef(0);
  const zoomStep = 1.24;

  useEffect(() => {
    const element = canvas.current;
    if (!element || !surface.current) return;
    const renderer = planetRenderer(element);
    if (!renderer) {
      setRendererFailed(true);
      return;
    }
    let closed = false;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1.3, 1.3, 1.3, -1.3, .1, 12);
    const key = new DirectionalLight("#fff4e4", 3);
    key.position.set(-2, -3, 4);
    scene.add(key, new AmbientLight("#faf4eb", 1.55));

    const polarLight = new DirectionalLight("#efeff7", 2.1);
    polarLight.position.set(-4, 7, -2);
    polarLight.visible = false;
    scene.add(polarLight);

    const abortRelief = new AbortController();
    let polar: Awaited<ReturnType<typeof loadPolarRelief>> | undefined;
    let moonModel: Awaited<ReturnType<typeof loadPlanet>> | undefined;
    const draw = () => {
      const pole = viewRef.current === "pole";
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const aspect = width / height;
      const { yaw, pitch, zoom, x, y } = cameraFrame.current;
      const raised = pole && poleModeRef.current === "3d";
      const globeFraming = hero ? 1.34 / Math.min(1, aspect) : Math.max(1.16, 1.12 / aspect);
      const polarFraming = raised ? Math.min(1.07, 1.55 / aspect) : Math.min(1.36, 1.87 / aspect);
      const vertical = pole ? polarFraming / Math.max(1, zoom) : globeFraming / zoom;
      const horizontal = vertical * aspect;
      const offsetX = pole ? Math.max(-2 + horizontal, Math.min(2 - horizontal, x * horizontal * 2)) : x * horizontal * 2;
      const offsetY = pole ? Math.max(-2 + vertical, Math.min(2 - vertical, y * vertical * 2)) : y * vertical * 2;
      camera.left = -horizontal - offsetX;
      camera.right = horizontal - offsetX;
      camera.top = vertical + offsetY;
      camera.bottom = -vertical + offsetY;
      if (pole) {
        const incline = (raised ? Math.max(18, Math.min(66, 44 + pitch * .65)) : 0) * Math.PI / 180;
        const bearing = (raised ? yaw + 13 : 0) * Math.PI / 180;
        camera.position.set(5 * Math.sin(incline) * Math.sin(bearing), 5 * Math.cos(incline), 5 * Math.sin(incline) * Math.cos(bearing));
        camera.up.set(0, raised ? 1 : 0, raised ? 0 : -1);
      } else {
        const latitude = Math.max(-87, Math.min(87, -24 + pitch));
        camera.position.copy(moonDirection(latitude, 16 - yaw, 4));
        camera.up.set(0, 1, 0);
      }
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      polarLight.visible = raised;
      key.visible = !pole;
      if (polar) {
        polar.map.visible = pole && !raised;
        polar.relief.visible = raised;
      }
      if (moonModel) {
        moonModel.visible = !pole;
        if (hero) moonModel.rotation.y = idleRotation.current;
      }

      const controls: { x: number; y: number }[] = [];
      for (const site of sitesRef.current) {
        const vector = pole ? polar?.point(site.latitude_deg, site.longitude_east_deg, raised)
          : moonDirection(site.latitude_deg, site.longitude_east_deg);
        const anchor = anchors.current[site.id];
        const token = tokens.current[site.id];
        const leader = leaders.current[site.id];
        if (!anchor || !token || !leader) continue;
        if (!vector) { anchor.hidden = token.hidden = leader.hidden = true; continue; }
        const screen = skyPoint(vector, camera);
        const visible = screen.onscreen && (pole || vector.dot(camera.position) > 0);
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
    }, { pan: !hero, maxZoom: hero ? 1.22 : 2.6 });
    controls.current = interaction;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const unavailable = () => setRendererFailed(true);
    element.addEventListener("webglcontextlost", unavailable);

    let spin: ReturnType<typeof setInterval> | undefined;
    void loadPlanet(MOON_ASSET, 1).then((moon) => {
      if (closed) { disposeScene(moon); return; }
      moonModel = moon;
      scene.add(moon);
      resize();
      setWebgl(true);
      if (hero) {
        const viewport = surface.current;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        spin = setInterval(() => {
          if (!viewport || reducedMotion.matches || document.hidden || viewport.matches(":hover, :focus-within")
            || viewport.dataset.dragging) return;
          const bounds = viewport.getBoundingClientRect();
          if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
          idleRotation.current = (idleRotation.current + .0018) % (Math.PI * 2);
          draw();
        }, 40);
      }
    }).catch(() => { /* Keep the map fallback and site controls accessible. */ });
    if (!hero) void loadPolarRelief(abortRelief.signal).then((loaded) => {
      if (closed) {
        const unused = new Group();
        unused.add(loaded.map, loaded.relief);
        disposeScene(unused);
        return;
      }
      polar = loaded;
      scene.add(loaded.map, loaded.relief);
      setHasRelief(true);
      draw();
    }).catch(() => { if (!closed) setReliefFailed(true); });

    return () => {
      closed = true;
      abortRelief.abort();
      clearInterval(spin);
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
    poleModeRef.current = poleMode;
    redraw.current?.();
  }, [sites, view, poleMode]);

  const flatPole = view === "pole" && poleMode === "2d";
  const ready = !rendererFailed && (view === "moon" ? webgl : hasRelief);
  const polarStatus = rendererFailed || reliefFailed ? "3D view unavailable on this device." : "Preparing 3D scene…";

  return <figure className={styles.figure} aria-label={t(hero ? "Interactive 3D Moon" : "Interactive lunar landing site map")}>
    {!hero && <div className={styles.toolbar}>
      <div className={styles.switches} aria-label={t("Globe camera")}>
        <button type="button" aria-pressed={view === "pole"} onClick={() => { controls.current?.reset(); setPanning(false); setView("pole"); }}>{t("South pole")}</button>
        <button type="button" aria-pressed={view === "moon"} onClick={() => { controls.current?.reset(); setPanning(false); setView("moon"); }}>{t("Globe")}</button>
      </div>
      {view === "pole" && <ViewMode mode={poleMode} onChange={(mode) => {
        if (poleMode === mode) return;
        controls.current?.reset();
        setPanning(false);
        setPoleMode(mode);
      }} />}
    </div>}
    <div ref={surface} data-panning={flatPole || panning} data-view={view} className={`${styles.viewport} ${styles.globeViewport} ${hero ? styles.heroGlobe : ""} ${ready ? styles.ready : ""}`}
      tabIndex={ready ? 0 : undefined} role="group" aria-label={t("Moon camera")}>
      <div className={styles.fallback}>
        {view === "pole" && poleMode === "3d" && !ready && <span className={styles.poleUnavailable} role="status">{t(polarStatus)}</span>}
        <div className={styles.fallbackOptions}>
          {sites.map((site, index) => <button key={site.id} type="button" aria-pressed={selectedId === site.id}
            onClick={() => onSelect?.(site.id)}>{index + 1} · {site.name}</button>)}
        </div>
      </div>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.labels} hidden={!ready}>
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
      {ready && !hero && <div className={styles.cameraTools}>
        {!flatPole && <button type="button" aria-label={t("Pan")} title={t("Pan")} aria-pressed={panning} onClick={() => setPanning(!panning)}><MaterialSymbol name="pan_tool" /></button>}
        <button type="button" aria-label={t("Zoom in")} title={t("Zoom in")} onClick={() => controls.current?.zoom(zoomStep)}><MaterialSymbol name="add" /></button>
        <button type="button" aria-label={t("Zoom out")} title={t("Zoom out")} onClick={() => controls.current?.zoom(1 / zoomStep)}><MaterialSymbol name="remove" /></button>
        <button type="button" aria-label={t("Reset view")} title={t("Reset view")} onClick={() => controls.current?.reset()}><MaterialSymbol name="restart_alt" /></button>
      </div>}
    </div>
    {!hero && view === "pole" && <figcaption>
      {poleMode === "3d" ? t("NASA LOLA · Elevation ×4") : "NASA LOLA"}
    </figcaption>}
    {hero && <figcaption><a href="/sources">{t("NASA Moon model")}</a></figcaption>}
  </figure>;
}
