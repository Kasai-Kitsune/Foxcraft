/**
 * ALL game art is generated here at runtime — 16x16 pixel canvases with the
 * noisy, gritty look of early Minecraft alpha. No external image files.
 */

import { hash2, hash2p, mulberry32 } from './rng';

export const TILE = 16;
export const ATLAS_COLS = 16;

/** Tile indices inside the block atlas. */
export const T = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  cobble: 4,
  planks: 5,
  logSide: 6,
  logTop: 7,
  leaves: 8,
  sand: 9,
  gravel: 10,
  coal: 11,
  iron: 12,
  brick: 13,
  bedrock: 14,
} as const;

type RGB = [number, number, number];

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function css(c: RGB, f = 1): string {
  return `rgb(${clamp255(c[0] * f)},${clamp255(c[1] * f)},${clamp255(c[2] * f)})`;
}

/** Create a 16x16 canvas; painter receives (x,y,color) setter and rng. */
function tex16(painter: (put: (x: number, y: number, c: string) => void, rnd: () => number) => void, seed = 1): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TILE;
  cv.height = TILE;
  const ctx = cv.getContext('2d')!;
  const put = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  painter(put, mulberry32(seed));
  return cv;
}

/** Per-pixel mottled fill with variation — the core "grit". */
function mottle(
  put: (x: number, y: number, c: string) => void,
  rnd: () => number,
  base: RGB,
  varLo: number,
  varHi: number,
  extra?: (x: number, y: number) => void
) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const f = varLo + rnd() * (varHi - varLo);
      put(x, y, css(base, f));
      if (extra) extra(x, y);
    }
  }
}

const GRASS: RGB = [106, 166, 62];
const DIRT: RGB = [134, 96, 67];
const STONE: RGB = [127, 127, 127];

function paintDirt(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  mottle(put, rnd, DIRT, 0.72, 1.12);
  for (let i = 0; i < 7; i++) {
    const x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
    const f = 0.66 + rnd() * 0.1;
    put(x, y, css(DIRT, f));
    if (x < 15 && rnd() < 0.7) put(x + 1, y, css(DIRT, f * 1.05));
  }
  for (let i = 0; i < 4; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(DIRT, 1.3));
}

function paintStone(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  mottle(put, rnd, STONE, 0.82, 1.1);
  // short dark cracks
  for (let i = 0; i < 5; i++) {
    let x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
    const len = 3 + (rnd() * 3) | 0;
    const horiz = rnd() < 0.5;
    for (let j = 0; j < len; j++) {
      put(Math.min(15, x), Math.min(15, y), css(STONE, 0.6 + rnd() * 0.1));
      if (horiz) x++; else y++;
    }
  }
  for (let i = 0; i < 5; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(STONE, 1.22));
}

function paintGrassTop(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  mottle(put, rnd, GRASS, 0.74, 1.14);
  for (let i = 0; i < 14; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(GRASS, 0.62));
  for (let i = 0; i < 8; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(GRASS, 1.3));
}

function paintGrassSide(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  paintDirt(put, rnd);
  for (let x = 0; x < TILE; x++) {
    const d = 2 + ((rnd() * 3) | 0); // jagged green band 2..4 px
    for (let y = 0; y < d; y++) put(x, y, css(GRASS, 0.78 + rnd() * 0.35));
    if (rnd() < 0.35) put(x, d, css(GRASS, 0.7 + rnd() * 0.3));
  }
}

function paintCobble(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const g = 0.82 + rnd() * 0.42;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x, py = by * 4 + y;
          const mortar = x === 3 || y === 3;
          const hi = x === 0 && y === 0;
          put(px, py, css(STONE, mortar ? 0.5 + rnd() * 0.12 : hi ? g * 1.3 : g * (0.9 + rnd() * 0.2)));
        }
      }
    }
  }
}

function paintPlanks(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const PLANK: RGB = [158, 127, 74];
  for (let band = 0; band < 4; band++) {
    const bvar = 0.88 + rnd() * 0.22;
    const joint = 2 + ((rnd() * 12) | 0);
    for (let y = band * 4; y < band * 4 + 4; y++) {
      for (let x = 0; x < 16; x++) {
        let f = bvar * (0.93 + rnd() * 0.14);
        if (y === band * 4 + 3) f = 0.5; // seam
        if (x === joint) f = 0.58; // board joint
        if (y === band * 4 && rnd() < 0.2) f *= 1.15;
        put(x, y, css(PLANK, f));
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = (rnd() * 15) | 0, y = (rnd() * 16) | 0;
    put(x, y, css(PLANK, 1.22));
    if (x < 15) put(x + 1, y, css(PLANK, 1.15));
  }
}

function paintLogSide(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const BARK: RGB = [103, 82, 49];
  const colVar: number[] = [];
  for (let x = 0; x < 16; x++) colVar.push(0.78 + rnd() * 0.42);
  const darkCol = [3, 9, 14];
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      let f = colVar[x] * (0.93 + rnd() * 0.14);
      if (darkCol.includes(x)) f *= 0.6;
      put(x, y, css(BARK, f));
    }
  }
  for (let i = 0; i < 6; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(BARK, 1.3));
}

function paintLogTop(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const RING_A: RGB = [170, 138, 88];
  const RING_B: RGB = [120, 95, 60];
  const BARK: RGB = [86, 66, 44];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c: RGB, f = 0.9 + rnd() * 0.2;
      if (d > 6.5) { c = BARK; f = 0.8 + rnd() * 0.3; }
      else c = Math.floor(d) % 2 === 0 ? RING_A : RING_B;
      if (d < 1) { c = RING_B; f = 0.85; }
      put(x, y, css(c, f));
    }
  }
}

function paintLeaves(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const LEAF: RGB = [56, 96, 32];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = rnd();
      let f = 0.72 + r * 0.55;
      if (rnd() < 0.1) f = 0.38; // dark holes
      else if (rnd() < 0.06) f = 1.4;
      put(x, y, css(LEAF, f));
    }
  }
}

function paintSand(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const SAND: RGB = [219, 206, 160];
  mottle(put, rnd, SAND, 0.86, 1.08);
  for (let i = 0; i < 8; i++) {
    const x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
    put(x, y, css(SAND, 0.74));
    if (x < 15 && rnd() < 0.5) put(x + 1, y, css(SAND, 0.78));
  }
}

function paintGravel(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const PAL: RGB[] = [[122, 112, 102], [88, 82, 76], [142, 134, 124], [104, 92, 80], [64, 60, 56]];
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const c = PAL[(rnd() * PAL.length) | 0];
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          put(bx * 2 + x, by * 2 + y, css(c, 0.9 + rnd() * 0.22));
        }
      }
    }
  }
}

function paintCoal(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  paintStone(put, rnd);
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((rnd() * 13) | 0), y = 1 + ((rnd() * 13) | 0);
    put(x, y, css([28, 28, 30], 0.9 + rnd() * 0.3));
    put(x + 1, y, css([28, 28, 30], 0.8 + rnd() * 0.3));
    put(x, y + 1, css([28, 28, 30], 0.85 + rnd() * 0.3));
    if (rnd() < 0.6) put(x + 1, y + 1, css([48, 48, 52], 1));
  }
}

function paintIron(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  paintStone(put, rnd);
  const IRON: RGB = [206, 166, 140];
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((rnd() * 13) | 0), y = 1 + ((rnd() * 13) | 0);
    put(x, y, css(IRON, 0.9 + rnd() * 0.25));
    put(x + 1, y, css(IRON, 0.8 + rnd() * 0.25));
    put(x, y + 1, css(IRON, 0.85 + rnd() * 0.25));
    if (rnd() < 0.6) put(x + 1, y + 1, css([236, 214, 196], 1));
  }
}

function paintBrick(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const BRICK: RGB = [146, 74, 62];
  const MORTAR: RGB = [178, 174, 168];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const band = (y / 4) | 0;
      const isMortarRow = y % 4 === 3;
      const jx = band % 2 === 0 ? 7 : 3;
      const isJoint = x === jx || x === (jx + 8) % 16;
      if (isMortarRow || isJoint) put(x, y, css(MORTAR, 0.86 + rnd() * 0.2));
      else {
        let f = 0.84 + rnd() * 0.3;
        if (y % 4 === 0 && rnd() < 0.25) f *= 1.15;
        put(x, y, css(BRICK, f));
      }
    }
  }
}

function paintBedrock(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const B: RGB = [110, 110, 110];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const f = 0.3 + rnd() * 0.95;
      put(x, y, css(B, f));
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = (rnd() * 15) | 0, y = (rnd() * 15) | 0;
    put(x, y, css(B, 0.22));
    put(x + 1, y, css(B, 0.25));
    put(x, y + 1, css(B, 0.3));
  }
}

function paintWater(put: (x: number, y: number, c: string) => void, rnd: () => number) {
  const W: RGB = [52, 96, 200];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      put(x, y, css(W, 0.88 + rnd() * 0.2));
    }
  }
  for (const yy of [2, 6, 11]) {
    const x0 = (rnd() * 8) | 0;
    const len = 4 + ((rnd() * 6) | 0);
    for (let x = x0; x < Math.min(16, x0 + len); x++) put(x, yy, css([120, 160, 235], 1));
  }
  for (let i = 0; i < 5; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(W, 0.6));
}

// ---------------------------------------------------------------------------
// Singletons (built once per session, client-side only)
// ---------------------------------------------------------------------------

let tiles: HTMLCanvasElement[] | null = null;
let atlasCanvas: HTMLCanvasElement | null = null;
let waterCanvas: HTMLCanvasElement | null = null;
let crackCanvases: HTMLCanvasElement[] | null = null;
let cloudCanvas: HTMLCanvasElement | null = null;

function buildTiles(): HTMLCanvasElement[] {
  const painters: Array<[number, (p: (x: number, y: number, c: string) => void, r: () => number) => void]> = [
    [T.grassTop, paintGrassTop],
    [T.grassSide, paintGrassSide],
    [T.dirt, paintDirt],
    [T.stone, paintStone],
    [T.cobble, paintCobble],
    [T.planks, paintPlanks],
    [T.logSide, paintLogSide],
    [T.logTop, paintLogTop],
    [T.leaves, paintLeaves],
    [T.sand, paintSand],
    [T.gravel, paintGravel],
    [T.coal, paintCoal],
    [T.iron, paintIron],
    [T.brick, paintBrick],
    [T.bedrock, paintBedrock],
  ];
  const out: HTMLCanvasElement[] = [];
  for (const [idx, painter] of painters) out[idx] = tex16(painter, 1000 + idx * 37);
  return out;
}

export function getTiles(): HTMLCanvasElement[] {
  if (!tiles) tiles = buildTiles();
  return tiles;
}

/** 256x256 block texture atlas. */
export function getAtlas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const tl = getTiles();
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * TILE;
  cv.height = ATLAS_COLS * TILE;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < tl.length; i++) {
    if (!tl[i]) continue;
    ctx.drawImage(tl[i], (i % ATLAS_COLS) * TILE, Math.floor(i / ATLAS_COLS) * TILE);
  }
  atlasCanvas = cv;
  return cv;
}

export function getWaterCanvas(): HTMLCanvasElement {
  if (!waterCanvas) waterCanvas = tex16(paintWater, 4242);
  return waterCanvas;
}

/** Cumulative crack overlay stages (0..4). */
export function getCracks(): HTMLCanvasElement[] {
  if (crackCanvases) return crackCanvases;
  // Pre-generate a fixed point list: random walks radiating from center.
  const rnd = mulberry32(777);
  const pts: Array<[number, number]> = [];
  for (let w = 0; w < 6; w++) {
    let x = 6 + ((rnd() * 4) | 0), y = 6 + ((rnd() * 4) | 0);
    for (let s = 0; s < 7; s++) {
      pts.push([x, y]);
      x = Math.max(0, Math.min(15, x + ((rnd() * 3) | 0) - 1));
      y = Math.max(0, Math.min(15, y + ((rnd() * 3) | 0) - 1));
    }
  }
  const out: HTMLCanvasElement[] = [];
  for (let stage = 0; stage < 5; stage++) {
    const cv = document.createElement('canvas');
    cv.width = TILE;
    cv.height = TILE;
    const ctx = cv.getContext('2d')!;
    const n = Math.floor((pts.length * (stage + 1)) / 5);
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      ctx.fillStyle = i % 3 === 0 ? 'rgba(10,10,10,0.75)' : 'rgba(25,25,25,0.55)';
      ctx.fillRect(x, y, 1, 1);
      if (i % 4 === 0) {
        ctx.fillStyle = 'rgba(15,15,15,0.4)';
        ctx.fillRect(Math.min(15, x + 1), y, 1, 1);
      }
    }
    out.push(cv);
  }
  crackCanvases = out;
  return out;
}

/** 64x64 seamless blocky cloud pattern (period-8 noise lattice). */
export function getClouds(): HTMLCanvasElement {
  if (cloudCanvas) return cloudCanvas;
  const N = 64, P = 8, S = 1337;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const val = (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = x - xi, v = y - yi;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = hash2p(xi, yi, P, S), b = hash2p(xi + 1, yi, P, S);
    const c = hash2p(xi, yi + 1, P, S), d = hash2p(xi + 1, yi + 1, P, S);
    const ab = a + (b - a) * su, cd = c + (d - c) * su;
    return ab + (cd - ab) * sv;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = val((x / N) * P, (y / N) * P);
      const i = (y * N + x) * 4;
      if (v > 0.58) {
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = 235;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  cloudCanvas = cv;
  return cv;
}

// ---------------------------------------------------------------------------
// Fox textures
// ---------------------------------------------------------------------------

export interface FoxTexSet {
  furO: HTMLCanvasElement;
  furW: HTMLCanvasElement;
  furB: HTMLCanvasElement;
  face: HTMLCanvasElement;
  earSide: HTMLCanvasElement;
  earFront: HTMLCanvasElement;
  leg: HTMLCanvasElement;
  bodySide: HTMLCanvasElement;
  bodyTop: HTMLCanvasElement;
}

let foxTex: FoxTexSet | null = null;

export function getFoxTex(): FoxTexSet {
  if (foxTex) return foxTex;
  const FOX_O: RGB = [222, 116, 48];
  const FOX_W: RGB = [238, 234, 226];
  const FOX_B: RGB = [42, 36, 32];

  const furO = tex16((put, rnd) => {
    mottle(put, rnd, FOX_O, 0.85, 1.12);
    for (let i = 0; i < 12; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(FOX_O, 0.7));
    for (let i = 0; i < 5; i++) put((rnd() * 16) | 0, (rnd() * 16) | 0, css(FOX_O, 1.28));
  }, 11);

  const furW = tex16((put, rnd) => mottle(put, rnd, FOX_W, 0.9, 1.06), 12);

  const furB = tex16((put, rnd) => mottle(put, rnd, FOX_B, 0.85, 1.25), 13);

  // Face: orange base, white muzzle w/ jagged top, black nose, dark eyes w/ glints
  const face = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        put(x, y, css(FOX_O, 0.85 + rnd() * 0.25));
      }
    }
    for (let x = 0; x < 16; x++) {
      const top = 9 + (rnd() < 0.5 ? 0 : 1);
      for (let y = top; y < 16; y++) put(x, y, css(FOX_W, 0.88 + rnd() * 0.18));
    }
    // cheek ruff
    for (let y = 10; y < 14; y++) {
      put(0, y, css(FOX_W, 0.92));
      put(1, y, rnd() < 0.6 ? css(FOX_W, 0.9) : css(FOX_O, 0.9));
      put(15, y, css(FOX_W, 0.92));
      put(14, y, rnd() < 0.6 ? css(FOX_W, 0.9) : css(FOX_O, 0.9));
    }
    // eyes 2x2 at (3,5) and (11,5)
    for (const ex of [3, 11]) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) put(ex + dx, 5 + dy, css(FOX_B, 0.9));
      }
      put(ex + 1, 5, css(FOX_W, 1.05)); // glint
    }
    // nose 2x2 bottom center
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) put(7 + dx, 14 + dy, css(FOX_B, 0.85));
    }
  }, 14);

  const earSide = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        put(x, y, css(y < 6 ? FOX_B : FOX_O, y < 6 ? 0.85 + rnd() * 0.2 : 0.85 + rnd() * 0.25));
      }
    }
  }, 15);

  const earFront = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let c: RGB = FOX_O, f = 0.85 + rnd() * 0.25;
        if (y < 6) { c = FOX_B; f = 0.85 + rnd() * 0.2; }
        else if (x >= 6 && x <= 9 && y >= 6 && y <= 12) { c = [58, 48, 44]; f = 0.9 + rnd() * 0.2; }
        put(x, y, css(c, f));
      }
    }
  }, 16);

  // legs: orange upper, black "stockings" lower
  const leg = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (y < 9) put(x, y, css(FOX_O, 0.85 + rnd() * 0.25));
        else if (y === 9) put(x, y, rnd() < 0.35 ? css(FOX_B, 0.9) : css(FOX_O, 0.9));
        else put(x, y, css(FOX_B, 0.85 + rnd() * 0.25));
      }
    }
  }, 17);

  // body side: orange with white belly bottom
  const bodySide = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (y < 10) put(x, y, css(FOX_O, 0.85 + rnd() * 0.25));
        else if (y === 10) put(x, y, rnd() < 0.4 ? css(FOX_W, 0.95) : css(FOX_O, 0.88));
        else put(x, y, css(FOX_W, 0.88 + rnd() * 0.16));
      }
    }
  }, 18);

  // body top: slight dorsal stripe
  const bodyTop = tex16((put, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const stripe = y >= 6 && y <= 9 ? 0.88 : 1;
        put(x, y, css(FOX_O, stripe * (0.85 + rnd() * 0.25)));
      }
    }
  }, 19);

  foxTex = { furO, furW, furB, face, earSide, earFront, leg, bodySide, bodyTop };
  return foxTex;
}

// ---------------------------------------------------------------------------
// Icons & UI helpers
// ---------------------------------------------------------------------------

/** Isometric block icon (data URL) for the hotbar. */
export function drawBlockIcon(topTile: HTMLCanvasElement, sideTile: HTMLCanvasElement, size = 48): string {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const s = size * 0.30;
  const cx = size / 2, cy = size / 2 + s * 0.35;
  // top diamond
  ctx.setTransform(s, 0.5 * s, -s, 0.5 * s, cx, cy - s);
  ctx.drawImage(topTile, 0, 0, 1, 1);
  // right face
  ctx.setTransform(s, 0.5 * s, 0, s, cx, cy - s * 0.5);
  ctx.drawImage(sideTile, 0, 0, 1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, 1, 1);
  // left face
  ctx.setTransform(s, 0.5 * s, 0, s, cx - s, cy - s * 0.5);
  ctx.drawImage(sideTile, 0, 0, 1, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, 1, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv.toDataURL();
}

/** Tiled dark dirt background for menus (data URL, 16x16). */
let dirtURL: string | null = null;
export function getDirtBackgroundURL(): string {
  if (dirtURL) return dirtURL;
  const t = getTiles();
  dirtURL = t[T.dirt].toDataURL();
  return dirtURL;
}
