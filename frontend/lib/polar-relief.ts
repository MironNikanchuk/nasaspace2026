import {
  DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  SRGBColorSpace, TextureLoader, Vector3,
} from "three";

const HALF_SIZE = 2;
const SPAN_METERS = 264_000;
const METERS_PER_UNIT = SPAN_METERS / HALF_SIZE;
const VERTICAL_EXAGGERATION = 4;
const LUNAR_RADIUS = 1_737_400;
const decimal = Math.PI / 180;

type HeightGrid = { halfSpanM: number; size: number; heights: number[] };

function elevation({ size, heights }: HeightGrid, x: number, z: number) {
  const u = Math.max(0, Math.min(size - 1, (x + HALF_SIZE) / (2 * HALF_SIZE) * (size - 1)));
  const v = Math.max(0, Math.min(size - 1, (z + HALF_SIZE) / (2 * HALF_SIZE) * (size - 1)));
  const col = Math.min(Math.floor(u), size - 2), row = Math.min(Math.floor(v), size - 2);
  const du = u - col, dv = v - row;
  const near = row * size + col, far = near + size;
  const meters = (1 - dv) * ((1 - du) * heights[near] + du * heights[near + 1])
    + dv * ((1 - du) * heights[far] + du * heights[far + 1]);
  return meters / METERS_PER_UNIT * VERTICAL_EXAGGERATION;
}

export async function loadPolarRelief(signal: AbortSignal) {
  const response = await fetch("/media/lola-relief.json", { signal });
  if (!response.ok) throw new Error("Could not load lunar elevation data");
  const grid: HeightGrid = await response.json();
  const { size } = grid;
  if (grid.halfSpanM !== SPAN_METERS || size < 2 || grid.heights.length !== size * size) {
    throw new Error("Invalid lunar elevation grid");
  }

  const texture = await new TextureLoader().loadAsync("/media/lola-pole.webp");
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const sheet = new PlaneGeometry(4, 4);
  sheet.rotateX(-Math.PI / 2);
  const map = new Mesh(sheet, new MeshBasicMaterial({ color: "#e4e4e4", map: texture }));
  const ground = new PlaneGeometry(4, 4, size - 1, size - 1);
  ground.rotateX(-Math.PI / 2);
  const positions = ground.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, grid.heights[index] / METERS_PER_UNIT * VERTICAL_EXAGGERATION);
  }
  ground.computeVertexNormals();
  const relief = new Mesh(ground, new MeshStandardMaterial({
    color: "#d6d5d3", map: texture, roughness: 1, side: DoubleSide,
  }));

  function point(latitude: number, longitude: number, raised: boolean) {
    const radius = 2 * LUNAR_RADIUS * Math.tan((latitude + 90) * decimal / 2) / METERS_PER_UNIT;
    const x = radius * Math.sin(longitude * decimal);
    const z = -radius * Math.cos(longitude * decimal);
    return new Vector3(x, (raised ? elevation(grid, x, z) : 0) + .008, z);
  }

  return { map, relief, point };
}

export function polarCoordinates(point: Vector3) {
  const radius = Math.hypot(point.x, point.z) * METERS_PER_UNIT;
  return {
    latitude_deg: -90 + 2 * Math.atan(radius / (2 * LUNAR_RADIUS)) / decimal,
    longitude_east_deg: (Math.atan2(point.x, -point.z) / decimal + 360) % 360,
  };
}

export const POLAR_UNITS_PER_KM = 1_000 / METERS_PER_UNIT;
