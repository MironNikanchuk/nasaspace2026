import {
  Box3, Material, Mesh, Object3D, Texture, Vector3, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import terrain from "@/data/terrain.json";
import type { Position } from "@/lib/types";

const degree = Math.PI / 180;
const tau = 2 * Math.PI;
const samples = terrain.sites as Record<string, { elevations_deg: number[] }>;

export function localDirection(azimuth: number, elevation: number, radius = 1) {
  const horizontal = radius * Math.cos(elevation * degree);
  return new Vector3(
    horizontal * Math.sin(azimuth * degree),
    radius * Math.sin(elevation * degree),
    -horizontal * Math.cos(azimuth * degree),
  );
}

export function positionDirection(position: Position, radius = 1) {
  return localDirection(position.azimuth_deg, position.elevation_deg, radius);
}

export function moonDirection(latitude: number, longitude: number, radius = 1) {
  // The original NASA GLB has north on +Y, longitude 0° on −X and east 90° on +Z.
  const horizontal = radius * Math.cos(latitude * degree);
  return new Vector3(
    -horizontal * Math.cos(longitude * degree),
    radius * Math.sin(latitude * degree),
    horizontal * Math.sin(longitude * degree),
  );
}

export function terrainProfile(siteId?: string): readonly number[] | undefined {
  return siteId ? samples[siteId]?.elevations_deg : undefined;
}

export function planetRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!context) return;
  try {
    const renderer = new WebGLRenderer({ canvas, context, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    return renderer;
  } catch {
    return;
  }
}

export async function loadPlanet(source: string, radius: number) {
  const { scene } = await new GLTFLoader().loadAsync(source);
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(extent) || extent <= 0) {
    disposeScene(scene);
    throw new Error("The NASA model has no valid mesh bounds");
  }
  scene.scale.multiplyScalar((radius * 2) / extent);
  scene.position.addScaledVector(center, -(radius * 2) / extent);
  return scene;
}

export function circlePoints(radius: number, elevation: number, count = 120) {
  return Array.from({ length: count }, (_, index) =>
    localDirection(index * tau / count / degree, elevation, radius));
}

export function disposeScene(root: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (!(node instanceof Mesh) && !("geometry" in node)) return;
    const renderable = node as Mesh;
    renderable.geometry?.dispose();
    const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of list) {
      if (material) materials.add(material);
    }
  });
  for (const material of materials) {
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) textures.add(value);
    });
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}
