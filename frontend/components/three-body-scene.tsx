"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending, AmbientLight, BufferGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import { connectCamera, type CameraFrame } from "@/lib/camera-motion";
import { disposeScene, loadPlanet, planetRenderer } from "@/lib/lunar-scene";
import type { Position, Sample } from "@/lib/types";
import { useLanguage } from "./language";
import styles from "./three-body-scene.module.css";

const definitions = [
  { name: "Sun", key: "sun", radius: .51, color: "#e6af72" },
  { name: "Moon", key: "moon", radius: .57, color: "#e6e4de" },
  { name: "Earth", key: "earth", radius: .39, color: "#a7ccf2" },
] as const;
const origin: CameraFrame = { yaw: 0, pitch: 0, zoom: 1, x: 0, y: 0 };
const lift = (angle: number) => Math.tanh(angle / 6) * .86;
const clearance = (position: Position) => position.elevation_deg - position.horizon_elevation_deg;

function star(radius: number) {
  return new Mesh(new SphereGeometry(radius, 48, 36), new ShaderMaterial({
    vertexShader: `
      varying vec3 vPoint;
      varying vec3 vNormal;
      void main() {
        vPoint = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 vPoint;
      varying vec3 vNormal;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(9.17, 43.79, 31.63))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 p = vPoint * 17.;
        float t = .37 * noise3(p * .52) + .38 * noise3(p) + .16 * noise3(p * 2.4) + .09 * noise3(p * 5.);
        vec3 color = mix(vec3(.34,.045,.006), vec3(1.,.72,.23), smoothstep(.29,.75,t));
        float limb = abs(normalize(vNormal).z);
        gl_FragColor = vec4(color * (.65 + .35 * sqrt(limb)), 1.);
        #include <colorspace_fragment>
      }`,
  }));
}

function sunHalo(radius: number) {
  return new Mesh(new PlaneGeometry(radius * 3.7, radius * 3.7), new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float r = length(vUv - .5) * 3.7;
        float glow = (1. - smoothstep(1., 1.85, r)) * .2 * exp(-2.6 * max(r - 1., 0.));
        gl_FragColor = vec4(1., .37, .08, glow);
      }`,
  }));
}

// An illustrated cross-section. Only the clearance at Earth's bearing is taken from LOLA.
function makeRidge() {
  const geometry = new PlaneGeometry(6.9, 2.4, 84, 32);
  geometry.rotateX(-Math.PI / 2);
  return new Mesh(geometry, new MeshStandardMaterial({ color: "#4b4a47", roughness: 1, side: DoubleSide }));
}

export default function ThreeBodyScene({ sample, site, terrain }: {
  sample: Sample; site: string; terrain?: boolean;
}) {
  const { t } = useLanguage();
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ sample, terrain });
  const redraw = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "available" | "failed">("loading");

  useEffect(() => {
    const stage = surface.current, element = canvas.current;
    if (!stage || !element) return;
    const renderer = planetRenderer(element);
    if (!renderer) { setStatus("failed"); return; }
    const scene = new Scene();
    const camera = new OrthographicCamera(-4, 4, 2, -2, .1, 40);
    const key = new DirectionalLight("#fff4e5", 3.2);
    const rim = new DirectionalLight("#a8c4eb", 1.4);
    key.position.set(-4, 6, 7);
    rim.position.set(4, 1, -5);
    scene.add(key, rim, new AmbientLight("#e2e7f0", 1.4));

    const bodies = definitions.map(({ key, radius, color }) => {
      const group = new Group();
      const placeholder = key === "sun" ? star(radius) : new Mesh(
        new SphereGeometry(radius, 36, 24), new MeshStandardMaterial({ color, roughness: .85 }));
      const halo = key === "sun" ? sunHalo(radius) : undefined;
      group.add(placeholder);
      if (halo) {
        halo.position.z = -radius * .94;
        group.add(halo);
      }
      scene.add(group);
      return { group, placeholder, halo };
    });
    let closed = false;
    for (const [index, filename] of [[1, "moon"], [2, "earth"]] as const) {
      const { group, placeholder } = bodies[index];
      void loadPlanet(`/media/nasa-${filename}.glb`, definitions[index].radius).then((planet) => {
        if (closed) { disposeScene(planet); return; }
        group.remove(placeholder);
        disposeScene(placeholder);
        planet.rotation.y = filename === "moon" ? -1.2 : .25;
        group.add(planet);
        draw();
      }).catch(() => { /* The lit sphere remains as a fallback. */ });
    }

    const rays = [0, 2].map((index) => {
      const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
      const line = new Line(geometry, new LineDashedMaterial({
        color: definitions[index].color, transparent: true, dashSize: .13, gapSize: .09,
      }));
      line.frustumCulled = false;
      scene.add(line);
      return line;
    });
    const ridge = makeRidge();
    ridge.frustumCulled = false;
    ridge.position.set(0, 0, -.86);
    scene.add(ridge);
    const horizontal = new Line(
      new BufferGeometry().setFromPoints([new Vector3(-3.1, 0, -.10), new Vector3(3.1, 0, -.10)]),
      new LineBasicMaterial({ color: "#a2a8b9", transparent: true, opacity: .24 }));
    scene.add(horizontal);
    const frame = { ...origin };
    const values = [0, 0];
    let hasFrame = false;
    let animation = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    function schedule() {
      if (!animation) animation = requestAnimationFrame(() => { animation = 0; draw(); });
    }

    function draw() {
      if (!element || !renderer || closed) return;
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const { sample, terrain } = state.current;
      const mode = terrain !== undefined;
      const positions = [sample.sun, sample.earth];
      const angles = positions.map((position) => mode ? position.elevation_deg : clearance(position));
      let moving = false;
      for (let index = 0; index < values.length; index++) {
        const next = lift(angles[index]);
        const delta = next - values[index];
        values[index] = !hasFrame || reduced.matches || Math.abs(delta) < .001 ? next : values[index] + delta * .25;
        moving ||= values[index] !== next;
      }
      hasFrame = true;
      const maxYaw = .56, maxPitch = .27;
      const yaw = maxYaw * Math.tanh(frame.yaw / 35);
      const pitch = .16 + maxPitch * Math.tanh(frame.pitch / 26);
      camera.position.set(10 * Math.sin(yaw) * Math.cos(pitch), 10 * Math.sin(pitch), 10 * Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(0, -.06, 0);
      const aspect = width / height;
      const halfHeight = Math.max(1.38, 3.35 / aspect) / frame.zoom;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      bodies[0].group.position.set(-2.18, values[0], .16);
      bodies[1].group.position.set(0, 0, .16);
      bodies[2].group.position.set(2.18, values[1], .16);
      for (const { group, halo } of bodies) {
        group.rotation.y = -yaw * .52;
        if (halo) halo.rotation.y = yaw * 1.52;
      }
      for (const [index, ray] of rays.entries()) {
        const point = bodies[index * 2].group.position;
        const start = bodies[1].group.position;
        const buffer = ray.geometry.getAttribute("position");
        buffer.setXYZ(0, start.x, start.y, start.z);
        buffer.setXYZ(1, point.x, point.y, point.z);
        buffer.needsUpdate = true;
        ray.computeLineDistances();
        const visible = mode && !terrain ? positions[index].elevation_deg > 0 : positions[index].above_horizon;
        ray.material.opacity = visible ? .86 : .34;
        ray.material.dashSize = visible ? 100 : .13;
      }
      ridge.visible = mode;
      if (mode) {
        const profile = ridge.geometry.getAttribute("position");
        const heightAtEarth = lift(terrain ? sample.earth.horizon_elevation_deg : 0);
        for (let i = 0; i < profile.count; i++) {
          const x = profile.getX(i), z = profile.getZ(i);
          const crest = Math.exp(-((x - 2.18) ** 2 / 1.8 + (z - .5) ** 2 * 1.45));
          const ripples = Math.sin(x * 7 + z * 5) * Math.cos(z * 9) * .026;
          profile.setY(i, terrain ? -.6 + (.6 + heightAtEarth) * crest + ripples : 0);
        }
        profile.needsUpdate = true;
        ridge.geometry.computeVertexNormals();
      }

      renderer.render(scene, camera);
      if (moving) schedule();
    }

    const interaction = connectCamera(stage, (next) => { Object.assign(frame, next); draw(); }, { minZoom: .85, maxZoom: 1.14 });
    const resize = new ResizeObserver(() => {
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      draw();
    });
    const contextLost = () => setStatus("failed");
    resize.observe(element);
    element.addEventListener("webglcontextlost", contextLost);
    redraw.current = schedule;
    setStatus("available");
    return () => {
      closed = true;
      cancelAnimationFrame(animation);
      interaction.dispose();
      resize.disconnect();
      element.removeEventListener("webglcontextlost", contextLost);
      redraw.current = null;
      disposeScene(scene);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    state.current = { sample, terrain };
    redraw.current?.();
  }, [sample, terrain]);

  return <div className={styles.viewer}>
    <div ref={surface} tabIndex={status === "available" ? 0 : undefined}
      aria-label={t("Drag to orbit the scene")} role="group" className={styles.stage}>
      <canvas aria-hidden="true" ref={canvas} />
      {status !== "available" && <span className={styles.loading} role="status">
        {t(status === "loading" ? "Preparing 3D scene…" : "3D view unavailable on this device.")}
      </span>}
    </div>
    <div className={styles.legend}>
      {definitions.map(({ name, key, color }) => {
        const position = key === "moon" ? undefined : sample[key];
        const angle = position && (terrain === undefined ? clearance(position) : position.elevation_deg);
        const visible = position && (terrain === false ? position.elevation_deg > 0 : position.above_horizon);
        return <span key={name}>
          <strong style={{ color }}>{t(name)}</strong>
          <small>{position && angle !== undefined
            ? `${angle > 0 ? "+" : ""}${angle.toFixed(2)}° · ${t(visible ? "Visible" : "Hidden")}` : site}</small>
        </span>;
      })}
    </div>
  </div>;
}
