import type { GridPoint } from "./types";
import { GroundType } from "./world";
import type { WorldData } from "./world";

export interface Minimap {
  updateCells: (indices: number[]) => void;
  render: (playerCell: GridPoint, targetCell: GridPoint | null) => void;
}

export function createMinimap(
  worldData: WorldData,
  revealedMask: Uint8Array,
  blockedMask: Uint8Array
): Minimap | null {
  const canvas = document.querySelector<HTMLCanvasElement>("#minimap");
  if (!canvas) {
    return null;
  }
  canvas.width = worldData.width;
  canvas.height = worldData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = worldData.width;
  baseCanvas.height = worldData.height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) {
    return null;
  }
  baseCtx.imageSmoothingEnabled = false;

  const imageData = baseCtx.createImageData(worldData.width, worldData.height);
  const data = imageData.data;
  for (let i = 0; i < worldData.width * worldData.height; i += 1) {
    data[i * 4 + 3] = 255;
  }
  baseCtx.putImageData(imageData, 0, 0);

  const palette: Record<GroundType, [number, number, number]> = {
    [GroundType.Water]: [22, 78, 118],
    [GroundType.Sand]: [210, 192, 132],
    [GroundType.Soil]: [86, 150, 84],
    [GroundType.Rock]: [120, 120, 120]
  };

  const updateCells = (indices: number[]): void => {
    let updated = false;
    for (const index of indices) {
      if (revealedMask[index] === 0) {
        continue;
      }
      const ground = worldData.ground[index] as GroundType;
      let [r, g, b] = palette[ground];
      if (ground === GroundType.Soil && blockedMask[index] === 1) {
        r = 55;
        g = 100;
        b = 65;
      }
      const base = index * 4;
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
      data[base + 3] = 255;
      updated = true;
    }
    if (updated) {
      baseCtx.putImageData(imageData, 0, 0);
    }
  };

  const render = (playerCell: GridPoint, targetCell: GridPoint | null): void => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseCanvas, 0, 0);

    ctx.fillStyle = "#f5c46b";
    ctx.fillRect(playerCell.x - 1, playerCell.y - 1, 3, 3);

    if (targetCell) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(targetCell.x - 2, targetCell.y - 2, 5, 5);
    }
  };

  return { updateCells, render };
}
