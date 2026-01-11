export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function fbm(
  noise2D: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let amplitude = 0.5;
  let frequency = 1.0;
  let sum = 0;
  let normalization = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * noise2D(x * frequency, y * frequency);
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  const value = sum / normalization;
  return value * 0.5 + 0.5;
}

export function ridgedFbm(
  noise2D: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let amplitude = 0.5;
  let frequency = 1.0;
  let sum = 0;
  let normalization = 0;

  for (let i = 0; i < octaves; i += 1) {
    const n = noise2D(x * frequency, y * frequency);
    const ridge = 1 - Math.abs(n);
    const sharp = ridge * ridge;
    sum += sharp * amplitude;
    normalization += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return normalization > 0 ? sum / normalization : 0;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
