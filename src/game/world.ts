/**
 * Voxel world: chunk storage, procedural generation (rolling hills, lakes,
 * winding caves, ore pockets, oak trees) and chunk meshing with classic
 * directional face shading + approximated skylight baked into vertex colors.
 */

import * as THREE from 'three';
import { fbm2, hash2, hash3, value3 } from './rng';
import { B, BLOCKS } from './blocks';
import { ATLAS_COLS, getAtlas, getWaterCanvas } from './textures';

export const CH = 16;   // chunk width/depth
export const WH = 64;   // world height
export const SEA = 30;  // water level

const PAD = 0.0008; // uv inset to avoid atlas bleeding

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;   // CH * WH * CH, index = (y*CH + z)*CH + x
  top: Uint8Array;      // per-column topmost opaque y (for skylight)
  dirty: boolean;
}

export function tileUV(t: number): [number, number, number, number] {
  const col = t % ATLAS_COLS;
  const row = Math.floor(t / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + PAD;
  const u1 = (col + 1) / ATLAS_COLS - PAD;
  const v0 = 1 - (row + 1) / ATLAS_COLS + PAD;
  const v1 = 1 - row / ATLAS_COLS - PAD;
  return [u0, v0, u1, v1];
}

const ckey = (cx: number, cz: number): number => ((cx & 0xffff) << 16) | (cz & 0xffff);

// Face tables: dir, corner offsets (CCW from outside), shade
interface FaceDef {
  n: [number, number, number];
  c: Array<[number, number, number]>; // 4 corners, uv pattern a(u0,v0) b(u1,v0) c(u1,v1) d(u0,v1)
  shade: number;
  kind: 'top' | 'bottom' | 'side';
}

const FACES: FaceDef[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62, kind: 'side' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62, kind: 'side' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, kind: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, kind: 'bottom' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.82, kind: 'side' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.82, kind: 'side' },
];

export class World {
  readonly seed: number;
  readonly chunks = new Map<number, Chunk>();
  /** Chunks whose meshes need rebuilding (managed by the renderer). */
  readonly dirtySet = new Set<number>();

  constructor(seed: number) {
    this.seed = seed;
  }

  // ---- Terrain shape (pure functions of x,z) ----

  surfaceHeight(x: number, z: number): number {
    const s = this.seed;
    let a = fbm2(x * 0.016, z * 0.016, s, 4);
    a = Math.min(1, Math.max(0, (a - 0.5) * 1.9 + 0.5)); // contrast stretch: real hills & valleys
    let h = 30.2 + (a - 0.5) * 16;
    const m = fbm2(x * 0.006 + 77, z * 0.006 - 13, s ^ 0x51ab, 3);
    if (m > 0.58) h += (m - 0.58) * 60; // mountains
    const lake = fbm2(x * 0.028 + 999, z * 0.028 + 999, s ^ 0x77f, 2);
    if (lake < 0.36) h -= (0.36 - lake) * 30; // lake basins
    return Math.max(6, Math.min(50, Math.round(h)));
  }

  private isCave(x: number, y: number, z: number): boolean {
    const s = this.seed;
    // winding sheet caves
    const sheet = Math.abs(value3(x * 0.062, y * 0.092, z * 0.062, s ^ 0xca7) - 0.5);
    if (sheet < 0.042) {
      const warp = value3(x * 0.05 + 31, y * 0.07, z * 0.05, s ^ 0x3d1);
      if (warp > 0.42) return true;
    }
    // occasional rooms
    if (value3(x * 0.045, y * 0.06, z * 0.045, s ^ 0x99b) > 0.79) return true;
    return false;
  }

  private hasTree(x: number, z: number): boolean {
    const h = this.surfaceHeight(x, z);
    if (h <= SEA + 2 || h > 46) return false;
    return hash2(x, z, this.seed ^ 0x7ee5) < 0.0065;
  }

  // ---- Chunk lifecycle ----

  generateChunk(cx: number, cz: number): Chunk {
    const key = ckey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const blocks = new Uint8Array(CH * CH * WH);
    const idx = (x: number, y: number, z: number) => (y * CH + z) * CH + x;
    const s = this.seed;

    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        const wx = cx * CH + lx;
        const wz = cz * CH + lz;
        const h = this.surfaceHeight(wx, wz);
        const beach = h <= SEA + 2;
        const underwater = h < SEA;

        for (let y = 0; y <= h; y++) {
          let b: number;
          if (y === 0) b = B.BEDROCK;
          else if (y <= 3 && hash3(wx, y, wz, s ^ 0x1234) < 0.55 - y * 0.15) b = B.BEDROCK;
          else if (y < h - 3) {
            b = B.STONE;
            // ores
            if (y < h - 4 && value3(wx * 0.19, y * 0.19, wz * 0.19, s ^ 0xc0a1) > 0.76) b = B.COAL_ORE;
            else if (y < 24 && value3(wx * 0.21 + 55, y * 0.21, wz * 0.21, s ^ 0x1207) > 0.79) b = B.IRON_ORE;
            else if (value3(wx * 0.16 - 90, y * 0.16, wz * 0.16 + 40, s ^ 0x6a5) > 0.8) b = B.GRAVEL;
          } else if (y < h) b = beach ? B.SAND : B.DIRT;
          else b = beach ? B.SAND : underwater ? B.DIRT : B.GRASS;

          // carve caves (keep lake beds sealed)
          if (b !== B.BEDROCK && b !== B.WATER && y > 3 && y <= h - (underwater ? 4 : 0)) {
            if (this.isCave(wx, y, wz)) b = B.AIR;
          }
          blocks[idx(lx, y, lz)] = b;
        }
        // water
        if (h < SEA) {
          for (let y = h + 1; y <= SEA; y++) blocks[idx(lx, y, lz)] = B.WATER;
        }
      }
    }

    // Trees (deterministic per world column; scan 2 blocks beyond chunk so
    // canopies cross chunk borders seamlessly)
    for (let tz = -2; tz < CH + 2; tz++) {
      for (let tx = -2; tx < CH + 2; tx++) {
        const wx = cx * CH + tx;
        const wz = cz * CH + tz;
        if (!this.hasTree(wx, wz)) continue;
        const h = this.surfaceHeight(wx, wz);
        const th = 4 + Math.floor(hash2(wx, wz, this.seed ^ 0x71) * 3); // trunk 4..6
        const setLocal = (x: number, y: number, z: number, b: number, overwrite: boolean) => {
          if (x < 0 || x >= CH || z < 0 || z >= CH || y < 1 || y >= WH) return;
          const i = idx(x, y, z);
          if (!overwrite && blocks[i] !== B.AIR) return;
          blocks[i] = b;
        };
        // leaf blob
        for (let ly = h + th - 2; ly <= h + th + 1; ly++) {
          const top = ly - (h + th);
          const r = top < 0 ? 2 : top === 0 ? 1 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (top === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue; // plus-shape cap
              if (Math.abs(dx) === r && Math.abs(dz) === r) {
                const keep = top < 0 ? 0.5 : 0.25;
                if (hash3(wx + dx, ly, wz + dz, this.seed ^ 0x1eaf) > keep) continue;
              }
              setLocal(tx + dx, ly, tz + dz, B.LEAVES, false);
            }
          }
        }
        // trunk
        for (let ly = h + 1; ly <= h + th; ly++) setLocal(tx, ly, tz, B.LOG, true);
      }
    }

    const chunk: Chunk = { cx, cz, blocks, top: new Uint8Array(CH * CH), dirty: false };
    this.chunks.set(key, chunk);
    this.recomputeTop(chunk);
    return chunk;
  }

  private recomputeTop(chunk: Chunk) {
    for (let lz = 0; lz < CH; lz++) {
      for (let lx = 0; lx < CH; lx++) {
        let t = 0;
        for (let y = WH - 1; y >= 0; y--) {
          if (BLOCKS[this.blockIn(chunk, lx, y, lz)].opaque) { t = y; break; }
        }
        chunk.top[lz * CH + lx] = t;
      }
    }
  }

  private blockIn(c: Chunk, x: number, y: number, z: number): number {
    return c.blocks[(y * CH + z) * CH + x];
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(ckey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WH) return B.AIR;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return B.AIR;
    return c.blocks[(y * CH + (z - cz * CH)) * CH + (x - cx * CH)];
  }

  /** Physics: unloaded chunks act as walls so you can never fall out of the world. */
  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (y >= WH) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return true;
    const b = c.blocks[(y * CH + (z - cz * CH)) * CH + (x - cx * CH)];
    return BLOCKS[b].solid;
  }

  /** Topmost opaque block y in column (0 if none/unloaded). */
  colTop(x: number, z: number): number {
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return 0;
    return c.top[(z - cz * CH) * CH + (x - cx * CH)];
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 1 || y >= WH) return false;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return false;
    const lx = x - cx * CH, lz = z - cz * CH;
    c.blocks[(y * CH + lz) * CH + lx] = id;

    // update column top for lighting
    const ti = lz * CH + lx;
    if (BLOCKS[id].opaque && y > c.top[ti]) c.top[ti] = y;
    else if (!BLOCKS[id].opaque && c.top[ti] === y) {
      let t = 0;
      for (let yy = WH - 1; yy >= 0; yy--) {
        if (BLOCKS[this.blockIn(c, lx, yy, lz)].opaque) { t = yy; break; }
      }
      c.top[ti] = t;
    }

    this.dirtySet.add(ckey(cx, cz));
    // neighbors are affected by edge faces + light corner sampling
    if (lx <= 1) this.markDirty(cx - 1, cz);
    if (lx >= CH - 2) this.markDirty(cx + 1, cz);
    if (lz <= 1) this.markDirty(cx, cz - 1);
    if (lz >= CH - 2) this.markDirty(cx, cz + 1);
    return true;
  }

  private markDirty(cx: number, cz: number) {
    if (this.chunks.has(ckey(cx, cz))) this.dirtySet.add(ckey(cx, cz));
  }

  // ---- Meshing ----

  private vlight(vx: number, vy: number, vz: number): number {
    let light = 1;
    for (let i = 0; i < 4; i++) {
      const cx = vx - (i & 1);
      const cz = vz - (i >> 1);
      const depth = this.colTop(cx, cz) - vy;
      if (depth > 0) {
        const l = Math.max(0.2, 1 - depth * 0.13);
        if (l < light) light = l;
      }
    }
    return light;
  }

  /** Build solid + water geometries for a chunk. Requires 8 neighbors generated. */
  buildMesh(cx: number, cz: number): { solid: THREE.BufferGeometry | null; water: THREE.BufferGeometry | null } {
    const chunk = this.chunks.get(ckey(cx, cz));
    if (!chunk) return { solid: null, water: null };

    const pos: number[] = [], uv: number[] = [], col: number[] = [], ind: number[] = [];
    const wpos: number[] = [], wuv: number[] = [], wcol: number[] = [], wind: number[] = [];
    const ox = cx * CH, oz = cz * CH;
    const gb = (x: number, y: number, z: number): number => {
      if (x >= 0 && x < CH && z >= 0 && z < CH) {
        if (y < 0 || y >= WH) return B.AIR;
        return chunk.blocks[(y * CH + z) * CH + x];
      }
      return this.getBlock(ox + x, y, oz + z);
    };

    for (let y = 0; y < WH; y++) {
      for (let lz = 0; lz < CH; lz++) {
        for (let lx = 0; lx < CH; lx++) {
          const b = chunk.blocks[(y * CH + lz) * CH + lx];
          if (b === B.AIR) continue;
          const bd = BLOCKS[b];
          const wx = ox + lx, wz = oz + lz;

          if (b === B.WATER) {
            const above = gb(lx, y + 1, lz);
            const topLowered = above !== B.WATER;
            for (let f = 0; f < 6; f++) {
              const F = FACES[f];
              const nb = gb(lx + F.n[0], y + F.n[1], lz + F.n[2]);
              if (f === 2) { // top
                if (above !== B.AIR) continue;
              } else if (nb !== B.AIR) continue;
              const base = wpos.length / 3;
              const light = this.vlight(wx + F.n[0] * 0 + 0, y + (f === 2 ? 1 : 0), wz); // approx
              for (let v = 0; v < 4; v++) {
                const c = F.c[v];
                const cy = y + c[1] * (topLowered && c[1] === 1 ? 0.88 : 1);
                wpos.push(lx + c[0], cy, lz + c[2]);
                wuv.push(v === 0 || v === 3 ? 0.02 : 0.98, v < 2 ? 0.02 : 0.98);
                const l = F.shade * (f === 2 ? light : Math.max(0.35, light));
                wcol.push(l, l, l);
              }
              wind.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            continue;
          }

          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nb = gb(lx + F.n[0], y + F.n[1], lz + F.n[2]);
            if (BLOCKS[nb].opaque) continue;
            const tile = F.kind === 'top' ? bd.top : F.kind === 'bottom' ? bd.bottom : bd.side;
            const [u0, v0, u1, v1] = tileUV(tile);
            const base = pos.length / 3;
            for (let v = 0; v < 4; v++) {
              const c = F.c[v];
              pos.push(lx + c[0], y + c[1], lz + c[2]);
              uv.push(v === 0 || v === 3 ? u0 : u1, v < 2 ? v0 : v1);
              const l = F.shade * this.vlight(wx + c[0], y + c[1], wz + c[2]);
              col.push(l, l, l);
            }
            ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }

    const mk = (p: number[], u: number[], c: number[], i: number[]): THREE.BufferGeometry | null => {
      if (!i.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      g.setIndex(i);
      g.computeBoundingSphere();
      return g;
    };

    return { solid: mk(pos, uv, col, ind), water: mk(wpos, wuv, wcol, wind) };
  }

  // ---- Raycast (DDA) ----

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (dir.x || 1e-9)), tDY = Math.abs(1 / (dir.y || 1e-9)), tDZ = Math.abs(1 / (dir.z || 1e-9));
    let tMX = tDX * (dir.x > 0 ? x + 1 - origin.x : origin.x - x);
    let tMY = tDY * (dir.y > 0 ? y + 1 - origin.y : origin.y - y);
    let tMZ = tDZ * (dir.z > 0 ? z + 1 - origin.z : origin.z - z);
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    for (let i = 0; i < 256; i++) {
      const b = this.getBlock(x, y, z);
      if (b !== B.AIR && b !== B.WATER) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMX < tMY && tMX < tMZ) {
        x += stepX; t = tMX; tMX += tDX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMY < tMZ) {
        y += stepY; t = tMY; tMY += tDY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMZ; tMZ += tDZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (t > maxDist) return null;
    }
    return null;
  }
}

// Shared materials (created once; textures are client-side singletons)
let solidMat: THREE.MeshBasicMaterial | null = null;
let waterMat: THREE.MeshBasicMaterial | null = null;

export function getSolidMaterial(): THREE.MeshBasicMaterial {
  if (!solidMat) {
    const tex = new THREE.CanvasTexture(getAtlas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    solidMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
  }
  return solidMat;
}

export function getWaterMaterial(): THREE.MeshBasicMaterial {
  if (!waterMat) {
    const tex = new THREE.CanvasTexture(getWaterCanvas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    waterMat = new THREE.MeshBasicMaterial({
      map: tex, vertexColors: true, transparent: true, opacity: 0.72,
      side: THREE.DoubleSide, depthWrite: false,
    });
  }
  return waterMat;
}
