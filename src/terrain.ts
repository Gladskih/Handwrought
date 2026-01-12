import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { getTerrainVertexHeight } from "./terrain-utils";
import { getHeight, getSlopeAt, GroundType, inBounds } from "./world";
import { buildGridMesh } from "./render";
import { clamp, mulberry32, smoothstep } from "./math";
import type { CellColorFn, GridMeshData, VertexColorFn } from "./render";
import type { WorldData, WorldGenConfig } from "./world";

export interface TerrainRenderData {
  terrain: GridMeshData;
  water: GridMeshData;
  terrainColor: CellColorFn;
  terrainVertexColor: VertexColorFn;
  waterColor: CellColorFn;
  waterVertexColor: VertexColorFn;
}

export function createTerrainRenderData(
  world: WorldData,
  config: WorldGenConfig,
  revealed: Uint8Array,
  cellSize: number,
  heightScale: number
): TerrainRenderData {
  const terrainNoise = createNoise2D(mulberry32(config.seed + 101));
  const macroNoise = createNoise2D(mulberry32(config.seed + 505));
  const waterNoise = createNoise2D(mulberry32(config.seed + 202));

  const soilColor = new THREE.Color(0x6fb86a);
  const sandColor = new THREE.Color(0xe6d3a2);
  const rockColor = new THREE.Color(0x8d8d8d);
  const waterBaseColor = new THREE.Color(0x4aa5cf);

  const terrainMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  const waterMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });

  const terrainColor: CellColorFn = (index, visible, out) => {
    if (!visible) {
      return out.setRGB(0, 0, 0);
    }
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const h = getHeight(world, x, y);
    const slope = getSlopeAt(world.heightmap, world.width, world.height, x, y);
    const sandMix = smoothstep(config.seaLevel + 0.01, config.seaLevel + 0.09, h);
    out.copy(sandColor).lerp(soilColor, sandMix);
    const rockMix = smoothstep(config.mountainHeight - 0.06, config.mountainHeight + 0.08, h);
    out.lerp(rockColor, rockMix);
    const jitter = terrainNoise(x * 0.2, y * 0.2) * 0.05;
    const macro = macroNoise(x * 0.05, y * 0.05) * 0.12;
    out.multiplyScalar(1 + jitter + macro);
    const slopeShade = clamp(1.05 - slope * 1.6, 0.6, 1.1);
    out.multiplyScalar(slopeShade);
    return out;
  };

  const terrainVertexColor: VertexColorFn = (vx, vy, cellIndex, visible, out) => {
    if (!visible) {
      return out.setRGB(0, 0, 0);
    }
    const h = getTerrainVertexHeight(world, vx, vy, config.seaLevel);
    const cellX = cellIndex % world.width;
    const cellY = Math.floor(cellIndex / world.width);
    const slope = getSlopeAt(world.heightmap, world.width, world.height, cellX, cellY);

    const sandMix = smoothstep(config.seaLevel + 0.01, config.seaLevel + 0.09, h);
    out.copy(sandColor).lerp(soilColor, sandMix);

    const rockByHeight = smoothstep(config.mountainHeight - 0.06, config.mountainHeight + 0.08, h);
    const rockBySlope = smoothstep(0.12, 0.19, slope);
    const rockMix = Math.max(rockByHeight, rockBySlope);
    out.lerp(rockColor, rockMix);

    const jitter = terrainNoise(vx * 0.2, vy * 0.2) * 0.05;
    const macro = macroNoise(vx * 0.05, vy * 0.05) * 0.12;
    out.multiplyScalar(1 + jitter + macro);
    const slopeShade = clamp(1.05 - slope * 1.6, 0.6, 1.1);
    out.multiplyScalar(slopeShade);
    return out;
  };

  const waterColor: CellColorFn = (index, visible, out) => {
    if (!visible) {
      return out.setRGB(0, 0, 0);
    }
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const jitter = waterNoise(x * 0.25, y * 0.25) * 0.05;
    out.copy(waterBaseColor).multiplyScalar(1 + jitter);
    return out;
  };

  const waterVertexColor: VertexColorFn = (vx, vy, cellIndex, visible, out) => {
    if (!visible) {
      return out.setRGB(0, 0, 0);
    }
    const jitter = waterNoise(vx * 0.25, vy * 0.25) * 0.05;
    const cellX = cellIndex % world.width;
    const cellY = Math.floor(cellIndex / world.width);
    const shore = isNearLand(world, cellX, cellY, config.seaLevel, 1);
    out.copy(waterBaseColor);
    if (shore) {
      out.lerp(sandColor, 0.2);
    }
    out.multiplyScalar(1 + jitter);
    return out;
  };

  const terrain = buildGridMesh(world, {
    cellSize,
    heightScale,
    revealed,
    includeCell: () => true,
    heightAtVertex: (x, y) => getTerrainVertexHeight(world, x, y, config.seaLevel),
    colorForCell: terrainColor,
    colorForVertex: terrainVertexColor,
    material: terrainMaterial
  });

  const seaHeight = config.seaLevel * heightScale + 0.08;
  const water = buildGridMesh(world, {
    cellSize,
    heightScale: 1,
    revealed,
    includeCell: (index) => world.ground[index] === GroundType.Water,
    heightAtVertex: () => seaHeight,
    colorForCell: waterColor,
    colorForVertex: waterVertexColor,
    material: waterMaterial
  });
  water.mesh.renderOrder = 1;

  return {
    terrain,
    water,
    terrainColor,
    terrainVertexColor,
    waterColor,
    waterVertexColor
  };
}

function isNearLand(
  worldData: WorldData,
  vx: number,
  vy: number,
  seaLevel: number,
  radius: number
): boolean {
  const baseX = Math.floor(vx);
  const baseY = Math.floor(vy);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cx = baseX + dx;
      const cy = baseY + dy;
      if (!inBounds(worldData, cx, cy)) {
        continue;
      }
      if (getHeight(worldData, cx, cy) >= seaLevel) {
        return true;
      }
    }
  }
  return false;
}

export { sampleTerrainHeightAtWorld } from "./terrain-utils";
