/**
 * Deterministic hashing + value noise for world generation.
 * Everything (terrain, caves, ores, trees, clouds, textures) derives from seeds
 * so worlds are reproducible from a seed string.
 */

export function strSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fin(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (x | 0), 2654435761);
  h = Math.imul(h ^ (y | 0), 2246822519);
  return fin(h);
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (x | 0), 2654435761);
  h = Math.imul(h ^ (y | 0), 40503);
  h = Math.imul(h ^ (z | 0), 2246822519);
  return fin(h);
}

/** Periodic hash for seamless cloud texture (period p). */
export function hash2p(x: number, y: number, p: number, seed: number): number {
  return hash2(((x % p) + p) % p, ((y % p) + p) % p, seed);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 2D value noise in [0,1]. */
export function value2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** 3D value noise in [0,1]. */
export function value3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const n000 = hash3(xi, yi, zi, seed);
  const n100 = hash3(xi + 1, yi, zi, seed);
  const n010 = hash3(xi, yi + 1, zi, seed);
  const n110 = hash3(xi + 1, yi + 1, zi, seed);
  const n001 = hash3(xi, yi, zi + 1, seed);
  const n101 = hash3(xi + 1, yi, zi + 1, seed);
  const n011 = hash3(xi, yi + 1, zi + 1, seed);
  const n111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** Fractal Brownian motion (2D) in [0,1]. */
export function fbm2(x: number, y: number, seed: number, octaves = 4, lac = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * value2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}
