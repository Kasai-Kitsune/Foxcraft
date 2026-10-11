/**
 * Block-break particles: pooled CPU-billboarded quads textured with random
 * 4x4 crops of the broken block's texture — classic alpha crunch.
 */

import * as THREE from 'three';
import { B, BLOCKS } from './blocks';
import { getAtlas } from './textures';

const MAX = 320;

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size: number;
}

export class Particles {
  private mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private uvAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private pool: P[] = [];
  private count = 0;

  constructor(private solidAt: (x: number, y: number, z: number) => boolean) {
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 4 * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(new Float32Array(MAX * 4 * 2), 2);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 4 * 3), 3);
    const indices = new Uint16Array(MAX * 6);
    for (let i = 0; i < MAX; i++) {
      const b = i * 4, j = i * 6;
      indices[j] = b; indices[j + 1] = b + 1; indices[j + 2] = b + 2;
      indices[j + 3] = b; indices[j + 4] = b + 2; indices[j + 5] = b + 3;
    }
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('uv', this.uvAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));

    const tex = new THREE.CanvasTexture(getAtlas());
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide });

    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  get object3D(): THREE.Mesh {
    return this.mesh;
  }

  get active(): number {
    return this.count;
  }

  reset() {
    this.count = 0;
    this.pool.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  burst(blockId: number, bx: number, by: number, bz: number, rnd: () => number) {
    if (blockId === B.AIR || blockId === B.WATER) return;
    const bd = BLOCKS[blockId];
    const tile = bd.side;
    const col = tile % 16, row = Math.floor(tile / 16);
    const n = 16 + Math.floor(rnd() * 8);
    for (let i = 0; i < n && this.count < MAX; i++) {
      if (this.pool.length <= this.count) this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, size: 0 });
      const p = this.pool[this.count];
      p.x = bx + 0.15 + rnd() * 0.7;
      p.y = by + 0.15 + rnd() * 0.7;
      p.z = bz + 0.15 + rnd() * 0.7;
      const a = rnd() * Math.PI * 2;
      const sp = 1 + rnd() * 2.5;
      p.vx = Math.cos(a) * sp;
      p.vy = 2 + rnd() * 3.2;
      p.vz = Math.sin(a) * sp;
      p.life = 0.4 + rnd() * 0.35;
      p.size = 0.09 + rnd() * 0.07;

      // random 4x4 px crop of the tile
      const px = Math.floor(rnd() * 12);
      const py = Math.floor(rnd() * 12);
      const u0 = (col * 16 + px) / 256;
      const u1 = (col * 16 + px + 4) / 256;
      const v1 = 1 - (row * 16 + py) / 256;
      const v0 = 1 - (row * 16 + py + 4) / 256;
      const uvs = this.uvAttr.array as Float32Array;
      const b = this.count * 8;
      uvs[b] = u0; uvs[b + 1] = v0;
      uvs[b + 2] = u1; uvs[b + 3] = v0;
      uvs[b + 4] = u1; uvs[b + 5] = v1;
      uvs[b + 6] = u0; uvs[b + 7] = v1;

      const shade = 0.72 + rnd() * 0.28;
      const cols = this.colAttr.array as Float32Array;
      const cb = this.count * 12;
      for (let v = 0; v < 4; v++) {
        cols[cb + v * 3] = shade;
        cols[cb + v * 3 + 1] = shade;
        cols[cb + v * 3 + 2] = shade;
      }
      this.count++;
    }
    this.uvAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.geo.setDrawRange(0, this.count * 6);
  }

  update(dt: number, camera: THREE.Camera) {
    if (this.count === 0) return;
    const pos = this.posAttr.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove
        const last = this.count - 1;
        if (i !== last) {
          const lp = this.pool[last];
          Object.assign(p, lp);
          const uvs = this.uvAttr.array as Float32Array;
          const cols = this.colAttr.array as Float32Array;
          uvs.copyWithin(i * 8, last * 8, last * 8 + 8);
          cols.copyWithin(i * 12, last * 12, last * 12 + 12);
        }
        this.count--;
        i--;
        continue;
      }
      p.vy -= 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.vy < 0 && this.solidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        p.y = Math.floor(p.y) + 1.001;
        p.vy = 0;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    this.geo.setDrawRange(0, this.count * 6);

    // billboard
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      const s = p.size;
      const b = i * 12;
      pos[b] = p.x + (-rx - ux) * s; pos[b + 1] = p.y + (-ry - uy) * s; pos[b + 2] = p.z + (-rz - uz) * s;
      pos[b + 3] = p.x + (rx - ux) * s; pos[b + 4] = p.y + (ry - uy) * s; pos[b + 5] = p.z + (rz - uz) * s;
      pos[b + 6] = p.x + (rx + ux) * s; pos[b + 7] = p.y + (ry + uy) * s; pos[b + 8] = p.z + (rz + uz) * s;
      pos[b + 9] = p.x + (-rx + ux) * s; pos[b + 10] = p.y + (-ry + uy) * s; pos[b + 11] = p.z + (-rz + uz) * s;
    }
    this.posAttr.needsUpdate = true;
  }
}
