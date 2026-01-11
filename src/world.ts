import { createNoise2D } from "simplex-noise";
import { fbm, mulberry32 } from "./math";

export enum GroundType {
  Water = 0,
  Sand = 1,
  Soil = 2,
  Rock = 3
}

export type WorldObjectType = "tree" | "rock";

export interface WorldObject {
  x: number;
  y: number;
  type: WorldObjectType;
}

export interface WorldData {
  width: number;
  height: number;
  heightmap: Float32Array;
  ground: Uint8Array;
  objects: WorldObject[];
}

export interface WorldGenConfig {
  width: number;
  height: number;
  seed: number;
  seaLevel: number;
  mountainHeight: number;
  slopeRock: number;
  sandHeight: number;
  sandChance: number;
  treeSlopeMax: number;
  forestScale: number;
  forestThreshold: number;
  treeChance: number;
  rockSlopeMax: number;
  rockChance: number;
}

export function generateWorld(config: WorldGenConfig): WorldData {
  const heightmap = new Float32Array(config.width * config.height);
  const ground = new Uint8Array(config.width * config.height);
  const objects: WorldObject[] = [];

  const heightRng = mulberry32(config.seed);
  const heightNoise = createNoise2D(heightRng);

  const forestRng = mulberry32(config.seed + 1337);
  const forestNoise = createNoise2D(forestRng);

  const objectRng = mulberry32(config.seed + 9001);

  const baseScale = 1 / 80;

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const idx = getIndex(config.width, x, y);
      const h = fbm(heightNoise, x * baseScale, y * baseScale, 5, 2.0, 0.5);
      heightmap[idx] = Math.pow(h, 1.05);
    }
  }

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const idx = getIndex(config.width, x, y);
      const h = heightmap[idx] ?? 0;
      if (h < config.seaLevel) {
        ground[idx] = GroundType.Water;
        continue;
      }

      const slope = getSlopeAt(heightmap, config.width, config.height, x, y);
      if (h > config.mountainHeight || slope > config.slopeRock) {
        ground[idx] = GroundType.Rock;
        continue;
      }

      const nearWater = isNearSea(heightmap, config.width, config.height, x, y, config.seaLevel, 2);
      if (nearWater && h < config.seaLevel + config.sandHeight && objectRng() < config.sandChance) {
        ground[idx] = GroundType.Sand;
      } else {
        ground[idx] = GroundType.Soil;
      }
    }
  }

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const idx = getIndex(config.width, x, y);
      const groundType = ground[idx];
      if (groundType === undefined) {
        continue;
      }
      const h = heightmap[idx] ?? 0;
      const slope = getSlopeAt(heightmap, config.width, config.height, x, y);

      if (
        groundType === GroundType.Soil &&
        slope < config.treeSlopeMax &&
        h > config.seaLevel + 0.02
      ) {
        const patch = fbm(forestNoise, x * config.forestScale, y * config.forestScale, 3, 2.0, 0.5);
        if (patch > config.forestThreshold && objectRng() < config.treeChance) {
          objects.push({ x, y, type: "tree" });
        }
      }

      if (groundType === GroundType.Rock && slope < config.rockSlopeMax && objectRng() < config.rockChance) {
        objects.push({ x, y, type: "rock" });
      }
    }
  }

  return {
    width: config.width,
    height: config.height,
    heightmap,
    ground,
    objects
  };
}

export function getIndex(width: number, x: number, y: number): number {
  return x + y * width;
}

export function inBounds(world: WorldData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function getHeight(world: WorldData, x: number, y: number): number {
  if (!inBounds(world, x, y)) {
    return 0;
  }
  return world.heightmap[getIndex(world.width, x, y)] ?? 0;
}

export function getGround(world: WorldData, x: number, y: number): GroundType {
  if (!inBounds(world, x, y)) {
    return GroundType.Water;
  }
  const value = world.ground[getIndex(world.width, x, y)];
  if (value === undefined) {
    return GroundType.Water;
  }
  return value as GroundType;
}

export function getVertexHeight(world: WorldData, vx: number, vy: number): number {
  let sum = 0;
  let count = 0;

  for (let dy = -1; dy <= 0; dy += 1) {
    for (let dx = -1; dx <= 0; dx += 1) {
      const cx = vx + dx;
      const cy = vy + dy;
      if (inBounds(world, cx, cy)) {
        sum += getHeight(world, cx, cy);
        count += 1;
      }
    }
  }

  return count > 0 ? sum / count : 0;
}

export function getSlopeAt(
  heightmap: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const idx = getIndex(width, x, y);
  const center = heightmap[idx] ?? 0;
  let maxDelta = 0;

  const offsets: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    const neighbor = heightmap[getIndex(width, nx, ny)] ?? center;
    maxDelta = Math.max(maxDelta, Math.abs(center - neighbor));
  }

  return maxDelta;
}

export function cellHasObject(world: WorldData, x: number, y: number): boolean {
  for (const obj of world.objects) {
    if (obj.x === x && obj.y === y) {
      return true;
    }
  }
  return false;
}

function isNearSea(
  heightmap: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  seaLevel: number,
  radius: number
): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const neighborHeight = heightmap[getIndex(width, nx, ny)] ?? 0;
      if (neighborHeight < seaLevel) {
        return true;
      }
    }
  }

  return false;
}
