/**
 * Game orchestrator: renderer/scene, game loop, input (keyboard/mouse/touch),
 * chunk streaming, the classic low-render-distance fog system (sky/cave/water),
 * mining with crack overlay, block placing, HUD/debug events to React.
 */

import * as THREE from 'three';
import { strSeed, mulberry32 } from './rng';
import { B, BLOCKS, HOTBAR } from './blocks';
import { World, CH, getSolidMaterial, getWaterMaterial } from './world';
import { Player } from './player';
import { FoxModel } from './fox';
import { Particles } from './particles';
import { Sfx } from './audio';
import { drawBlockIcon, getCracks, getClouds, getTiles } from './textures';

export type GameState = 'title' | 'loading' | 'playing' | 'paused';

export type UIMsg =
  | { t: 'state'; state: GameState }
  | { t: 'progress'; phase: string; p: number }
  | { t: 'hud'; slot: number; flash: string }
  | { t: 'debug'; lines: string[] }
  | { t: 'debugOn'; on: boolean }
  | { t: 'settings'; fog: string; sound: boolean; cam: string }
  | { t: 'lock'; locked: boolean };

export const FOG_PRESETS = [
  { name: 'Foggy', chunks: 3, near: 6, far: 40 },
  { name: 'Short', chunks: 4, near: 14, far: 56 },
  { name: 'Normal', chunks: 6, near: 26, far: 100 },
] as const;

const SKY_COLOR = new THREE.Color(0xa5c8ff);
const FOG_SKY = new THREE.Color(0xccddff);
const FOG_CAVE = new THREE.Color(0x0c0b09);
const BG_CAVE = new THREE.Color(0x16130f);
const FOG_WATER = new THREE.Color(0x24438f);
const SUN_DIR = new THREE.Vector3(0.5, 0.62, 0.3).normalize();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ChunkMeshes {
  solid?: THREE.Mesh;
  water?: THREE.Mesh;
}

export class Game {
  state: GameState = 'title';
  locked = false;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private onMsg: (m: UIMsg) => void;
  private abort = new AbortController();

  private world!: World;
  private player = new Player();
  private fox = new FoxModel();
  private particles!: Particles;
  private sfx = new Sfx();
  private rnd = mulberry32(1);

  private meshes = new Map<number, ChunkMeshes>();
  private genOffsets: Array<[number, number]> = [];
  private meshOffsets: Array<[number, number]> = [];
  private lastPcx = 9999;
  private lastPcz = 9999;

  private sun!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  private highlight!: THREE.LineSegments;
  private crackMesh!: THREE.Mesh;
  private crackTex: THREE.CanvasTexture[] = [];

  private fogIdx = 0;
  private fogColor = FOG_SKY.clone();
  private fogNear = 6;
  private fogFar = 40;
  private bgColor = SKY_COLOR.clone();

  private keys = new Set<string>();
  private mineDown = false;
  private placeDown = false;
  private placeTimer = 0;
  private mineTarget: string | null = null;
  private mineProgress = 0;
  private digSoundAcc = 0;
  private stepAcc = 0;
  private hotbarIdx = 0;
  private firstPerson = false;
  private debugOn = false;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private debugTimer = 0;
  private fovCur = 70;
  private tSec = 0;
  private lastT = 0;
  seedLabel = '';

  touch = { jx: 0, jy: 0, jump: false, mining: false };
  private touchLook = { dx: 0, dy: 0 };

  /** Touch joystick vector (-1..1, y up). */
  setTouchMove(x: number, y: number) {
    this.touch.jx = x;
    this.touch.jy = y;
  }

  setTouchJump(v: boolean) {
    this.touch.jump = v;
  }

  setTouchMining(v: boolean) {
    this.touch.mining = v;
  }

  constructor(canvas: HTMLCanvasElement, onMsg: (m: UIMsg) => void) {
    this.canvas = canvas;
    this.onMsg = onMsg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 800);
    this.camera.rotation.order = 'YXZ';

    this.initScene();
    this.bindEvents();

    (window as unknown as { __foxcraft?: Game }).__foxcraft = this;
    this.renderer.setAnimationLoop(this.loop);
    this.resize();
  }

  // ------------------------------------------------------------------ setup

  private initScene() {
    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(this.fogColor.clone(), this.fogNear, this.fogFar);

    // square sun (classic)
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 34),
      new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false, depthTest: false, depthWrite: false })
    );
    this.sun.renderOrder = -10;
    this.scene.add(this.sun);

    // drifting blocky clouds
    const cloudTex = new THREE.CanvasTexture(getClouds());
    cloudTex.magFilter = THREE.NearestFilter;
    cloudTex.minFilter = THREE.NearestFilter;
    cloudTex.generateMipmaps = false;
    cloudTex.wrapS = THREE.RepeatWrapping;
    cloudTex.wrapT = THREE.RepeatWrapping;
    const cloudGeo = new THREE.PlaneGeometry(768, 768);
    cloudGeo.rotateX(-Math.PI / 2);
    this.clouds = new THREE.Mesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.85,
        depthWrite: false, fog: false, side: THREE.DoubleSide,
      })
    );
    this.clouds.position.y = 78;
    this.clouds.renderOrder = 3;
    this.scene.add(this.clouds);

    // block highlight
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // crack overlay
    this.crackTex = getCracks().map((cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    });
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false })
    );
    this.crackMesh.renderOrder = 2;
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // fox + first-person paw (paw materials get depthTest:false so they draw over the world)
    this.scene.add(this.fox.group);
    this.camera.add(this.fox.fpGroup);
    this.scene.add(this.camera);
    this.fox.fpGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const cloneMats = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        c.depthTest = false;
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMats) : cloneMats(mesh.material);
      mesh.renderOrder = 999;
    });

    this.particles = new Particles((x, y, z) => this.world.isSolid(x, y, z));
    this.scene.add(this.particles.object3D);
  }

  private offsets(R: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) out.push([dx, dz]);
    }
    out.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    return out;
  }

  // ------------------------------------------------------------------ world

  async newWorld(seedStr: string, fogIdx: number) {
    this.setState('loading');
    this.fogIdx = fogIdx;
    this.disposeMeshes();
    this.world = new World(strSeed(seedStr || 'fox'));
    this.seedLabel = seedStr || 'fox';
    this.rnd = mulberry32(strSeed(this.seedLabel) ^ 0xbeef);
    this.particles.reset();

    // spawn
    let sx = 8, sz = 8, sy = 40;
    outer: for (let r = 0; r < 60; r++) {
      const steps = Math.max(1, r * 8);
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r * 2);
        const z = Math.round(Math.sin(ang) * r * 2);
        const h = this.world.surfaceHeight(x, z);
        if (h > 31 && h <= 44) { sx = x; sz = z; sy = h; break outer; }
      }
    }
    this.player.pos.set(sx + 0.5, sy + 1.05, sz + 0.5);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.PI * 0.25;
    this.player.pitch = -0.05;
    this.lastPcx = 9999;

    const R = FOG_PRESETS[this.fogIdx].chunks;
    const genOff = this.offsets(R + 1);
    const pcx = Math.floor(this.player.pos.x / CH), pcz = Math.floor(this.player.pos.z / CH);

    let done = 0;
    let t0 = performance.now();
    for (const [dx, dz] of genOff) {
      this.world.generateChunk(pcx + dx, pcz + dz);
      done++;
      if (performance.now() - t0 > 14) {
        this.onMsg({ t: 'progress', phase: 'Generating terrain', p: 0.05 + 0.6 * (done / genOff.length) });
        await sleep(0);
        t0 = performance.now();
      }
    }

    done = 0;
    t0 = performance.now();
    for (const [dx, dz] of this.offsets(R)) {
      this.rebuildChunkMesh(pcx + dx, pcz + dz);
      done++;
      if (performance.now() - t0 > 14) {
        this.onMsg({ t: 'progress', phase: 'Assembling world', p: 0.65 + 0.35 * (done / ((2 * R + 1) ** 2)) });
        await sleep(0);
        t0 = performance.now();
      }
    }

    this.onMsg({ t: 'progress', phase: 'Reticulating foxes', p: 1 });
    await sleep(160);

    this.hotbarIdx = 0;
    this.mineProgress = 0;
    this.mineTarget = null;
    this.setState('playing');
    this.emitSettings();
    this.onMsg({ t: 'hud', slot: 0, flash: BLOCKS[HOTBAR[0]].name });
  }

  private rebuildChunkMesh(cx: number, cz: number) {
    const key = ((cx & 0xffff) << 16) | (cz & 0xffff);
    const { solid, water } = this.world.buildMesh(cx, cz);
    let rec = this.meshes.get(key);
    if (!rec) {
      rec = {};
      this.meshes.set(key, rec);
    }
    if (rec.solid) {
      this.scene.remove(rec.solid);
      rec.solid.geometry.dispose();
      rec.solid = undefined;
    }
    if (rec.water) {
      this.scene.remove(rec.water);
      rec.water.geometry.dispose();
      rec.water = undefined;
    }
    if (solid) {
      const m = new THREE.Mesh(solid, getSolidMaterial());
      m.position.set(cx * CH, 0, cz * CH);
      this.scene.add(m);
      rec.solid = m;
    }
    if (water) {
      const m = new THREE.Mesh(water, getWaterMaterial());
      m.position.set(cx * CH, 0, cz * CH);
      rec.water = m;
      this.scene.add(m);
    }
    this.world.dirtySet.delete(key);
  }

  private disposeMeshes() {
    for (const rec of this.meshes.values()) {
      if (rec.solid) { this.scene.remove(rec.solid); rec.solid.geometry.dispose(); }
      if (rec.water) { this.scene.remove(rec.water); rec.water.geometry.dispose(); }
    }
    this.meshes.clear();
  }

  /** Stream chunks around the player with a per-frame time budget. */
  private updateChunks() {
    const R = FOG_PRESETS[this.fogIdx].chunks;
    const pcx = Math.floor(this.player.pos.x / CH);
    const pcz = Math.floor(this.player.pos.z / CH);
    if (pcx !== this.lastPcx || pcz !== this.lastPcz) {
      this.lastPcx = pcx;
      this.lastPcz = pcz;
      this.genOffsets = this.offsets(R + 1);
      this.meshOffsets = this.offsets(R);
    }

    const t0 = performance.now();
    const budget = 7;

    // generate
    for (const [dx, dz] of this.genOffsets) {
      if (performance.now() - t0 > budget) return;
      if (!this.world.hasChunk(pcx + dx, pcz + dz)) {
        this.world.generateChunk(pcx + dx, pcz + dz);
      }
    }

    // mesh (incl. edited chunks)
    for (const [dx, dz] of this.meshOffsets) {
      if (performance.now() - t0 > budget) return;
      const cx = pcx + dx, cz = pcz + dz;
      const key = ((cx & 0xffff) << 16) | (cz & 0xffff);
      const needsMesh = !this.meshes.has(key) || this.world.dirtySet.has(key);
      if (!needsMesh) continue;
      let ok = true;
      for (let nz = -1; nz <= 1 && ok; nz++) {
        for (let nx = -1; nx <= 1 && ok; nx++) {
          if (!this.world.hasChunk(cx + nx, cz + nz)) ok = false;
        }
      }
      if (ok) this.rebuildChunkMesh(cx, cz);
    }

    // unload distant meshes (keep world data)
    if (this.meshes.size > (2 * R + 5) ** 2) {
      for (const [key, rec] of this.meshes) {
        const cx = key >> 16;
        const cz = (key << 16) >> 16;
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > R + 2) {
          if (rec.solid) { this.scene.remove(rec.solid); rec.solid.geometry.dispose(); }
          if (rec.water) { this.scene.remove(rec.water); rec.water.geometry.dispose(); }
          this.meshes.delete(key);
        }
      }
    }
  }

  // ------------------------------------------------------------------ input

  private bindEvents() {
    const opts = { signal: this.abort.signal } as AddEventListenerOptions;
    const w = window;

    w.addEventListener('resize', () => this.resize(), opts);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onMsg({ t: 'lock', locked: this.locked });
      if (!this.locked && this.state === 'playing') {
        this.setState('paused');
      } else if (this.locked && this.state === 'paused') {
        this.setState('playing');
      }
    }, opts);
    document.addEventListener('pointerlockerror', () => {
      /* stay paused; user can click again */
    }, opts);

    w.addEventListener('keydown', (e) => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F5', 'F3'].includes(e.code)) {
        e.preventDefault();
      }
      if (this.state === 'paused') {
        if (e.code === 'Escape') this.resume();
        return;
      }
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.selectSlot(n - 1);
      }
      switch (e.code) {
        case 'KeyF': this.cycleFog(); break;
        case 'KeyV': case 'F5': this.toggleCamera(); break;
        case 'KeyG': case 'F3': this.toggleDebug(); break;
        case 'KeyM': this.toggleSound(); break;
      }
    }, opts);

    w.addEventListener('keyup', (e) => this.keys.delete(e.code), opts);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      this.sfx.ensure();
      if (e.button === 0) {
        this.mineDown = true;
        this.fox.setMining(true);
      } else if (e.button === 2) {
        this.placeDown = true;
        this.placeTimer = 0;
        this.placeOnce();
      }
    }, opts);
    w.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mineDown = false;
        this.fox.setMining(false);
        this.mineProgress = 0;
        this.mineTarget = null;
        this.crackMesh.visible = false;
      } else if (e.button === 2) {
        this.placeDown = false;
      }
    }, opts);
    w.addEventListener('mousemove', (e) => {
      if (!this.locked || this.state !== 'playing') return;
      this.addLook(e.movementX, e.movementY);
    }, opts);
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state !== 'playing' || !this.locked) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.hotbarIdx + dir + HOTBAR.length) % HOTBAR.length);
    }, { ...opts, passive: false });
    w.addEventListener('blur', () => {
      this.keys.clear();
      this.mineDown = false;
      this.placeDown = false;
    }, opts);
  }

  addLook(dx: number, dy: number) {
    const s = 0.0022;
    this.player.yaw -= dx * s;
    this.player.pitch -= dy * s;
    const lim = this.firstPerson ? 1.55 : 1.3;
    const lo = this.firstPerson ? -1.55 : -1.35;
    this.player.pitch = Math.max(lo, Math.min(lim, this.player.pitch));
  }

  /** Touch look drag accumulation (applied in update). */
  addTouchLook(dx: number, dy: number) {
    this.touchLook.dx += dx;
    this.touchLook.dy += dy;
  }

  touchPlace() {
    if (this.state === 'playing') {
      this.sfx.ensure();
      this.placeOnce();
    }
  }

  private requestLock(retry = true) {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (retry) {
            window.setTimeout(() => {
              if (this.state === 'playing' && !this.locked) this.requestLock(false);
            }, 1400);
          }
        });
      }
    } catch {
      /* pointer lock unsupported (e.g. some touch devices) — fine */
    }
  }

  /** Public: capture the mouse (from the "Click to play" overlay). */
  lockNow() {
    this.sfx.ensure();
    this.requestLock();
  }

  // ------------------------------------------------------------------ actions

  private rayTarget() {
    return this.world.raycast(this.player.eyePosition(), this.player.forward(), 5);
  }

  private placeOnce() {
    const hit = this.rayTarget();
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER) return;
    if (this.player.intersectsCell(x, y, z)) return;
    const id = HOTBAR[this.hotbarIdx];
    if (this.world.setBlock(x, y, z, id)) {
      this.sfx.place(BLOCKS[id].sound);
      this.fox.swing();
    }
  }

  private updateMining(dt: number) {
    const mining = this.mineDown || this.touch.mining;
    const hit = this.rayTarget();

    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }

    if (!mining || !hit) {
      this.mineProgress = 0;
      this.mineTarget = null;
      this.crackMesh.visible = false;
      return;
    }

    const key = `${hit.x},${hit.y},${hit.z}`;
    if (key !== this.mineTarget) {
      this.mineTarget = key;
      this.mineProgress = 0;
    }
    const b = this.world.getBlock(hit.x, hit.y, hit.z);
    const hard = BLOCKS[b].hardness;
    if (!isFinite(hard)) return; // bedrock

    this.mineProgress += dt / hard;

    // periodic dig sound
    this.digSoundAcc += dt;
    if (this.digSoundAcc > 0.22) {
      this.digSoundAcc = 0;
      this.sfx.dig(BLOCKS[b].sound);
      this.fox.swing();
    }

    const stage = Math.min(4, Math.floor(this.mineProgress * 5));
    this.crackMesh.visible = this.mineProgress > 0.02;
    (this.crackMesh.material as THREE.MeshBasicMaterial).map = this.crackTex[stage];
    this.crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    if (this.mineProgress >= 1) {
      this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
      this.particles.burst(b, hit.x, hit.y, hit.z, this.rnd);
      this.sfx.breakBlock(BLOCKS[b].sound);
      this.mineProgress = 0;
      this.mineTarget = null;
      this.crackMesh.visible = false;
    }
  }

  // ------------------------------------------------------------------ public API (React)

  setState(s: GameState) {
    this.state = s;
    this.onMsg({ t: 'state', state: s });
  }

  resume() {
    this.sfx.ensure();
    if (this.state !== 'paused') return;
    this.requestLock();
    // optimistically resume gameplay (lock usually follows)
    this.setState('playing');
  }

  pause() {
    if (this.state !== 'playing') return;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setState('paused');
    this.keys.clear();
    this.mineDown = false;
    this.placeDown = false;
    this.fox.setMining(false);
  }

  toTitle() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.disposeMeshes();
    this.particles.reset();
    this.setState('title');
  }

  selectSlot(i: number) {
    this.hotbarIdx = i;
    this.onMsg({ t: 'hud', slot: i, flash: BLOCKS[HOTBAR[i]].name });
  }

  setFog(i: number) {
    this.fogIdx = i;
    this.lastPcx = 9999; // force offset refresh
    this.emitSettings();
  }

  cycleFog() {
    this.setFog((this.fogIdx + 1) % FOG_PRESETS.length);
  }

  toggleCamera() {
    this.firstPerson = !this.firstPerson;
    this.fox.setFirstPerson(this.firstPerson);
    this.emitSettings();
  }

  toggleDebug() {
    this.debugOn = !this.debugOn;
    this.onMsg({ t: 'debugOn', on: this.debugOn });
    if (!this.debugOn) this.onMsg({ t: 'debug', lines: [] });
  }

  toggleSound() {
    this.sfx.setMuted(!this.sfx.muted);
    this.emitSettings();
  }

  private emitSettings() {
    this.onMsg({
      t: 'settings',
      fog: FOG_PRESETS[this.fogIdx].name,
      sound: !this.sfx.muted,
      cam: this.firstPerson ? 'First Person' : 'Third Person',
    });
  }

  getHotbarIcons(): string[] {
    const tiles = getTiles();
    return HOTBAR.map((id) => drawBlockIcon(tiles[BLOCKS[id].top], tiles[BLOCKS[id].side], 48));
  }

  getHotbarNames(): string[] {
    return HOTBAR.map((id) => BLOCKS[id].name);
  }

  getVersion(): string {
    return 'Foxcraft Alpha 0.1.0';
  }

  // ------------------------------------------------------------------ loop

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private loop = (tms: number) => {
    const dt = Math.min(0.05, (tms - this.lastT) / 1000 || 0.016);
    this.lastT = tms;
    this.tSec += dt;

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    if (this.state === 'playing') {
      // touch look
      if (this.touchLook.dx || this.touchLook.dy) {
        this.addLook(this.touchLook.dx, this.touchLook.dy);
        this.touchLook.dx = 0;
        this.touchLook.dy = 0;
      }

      const input = {
        fwd: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
        back: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
        left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
        right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
        jump: this.keys.has('Space') || this.touch.jump,
        sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        jx: this.touch.jx,
        jy: this.touch.jy,
      };
      this.player.update(dt, input, this.world);
      this.fox.update(dt, this.player);
      this.updateChunks();
      this.updateMining(dt);
      this.particles.update(dt, this.camera);

      // hold-to-place repeat
      if (this.placeDown) {
        this.placeTimer += dt;
        if (this.placeTimer > 0.24) {
          this.placeTimer = 0;
          this.placeOnce();
        }
      }

      // footsteps
      if (this.player.onGround && this.player.speed > 1.5) {
        this.stepAcc += this.player.speed * dt;
        if (this.stepAcc > 2.1) {
          this.stepAcc = 0;
          const gb = this.player.groundBlock;
          if (gb !== B.AIR) this.sfx.step(BLOCKS[gb].sound);
        }
      } else {
        this.stepAcc = 1.8;
      }

      // camera
      if (this.firstPerson) {
        this.player.firstPersonCamera(this.camera);
      } else {
        this.player.thirdPersonCamera(this.camera, this.world);
      }
      const fovTarget = 70 + (this.player.sprinting ? 9 : 0);
      if (Math.abs(this.fovCur - fovTarget) > 0.05) {
        this.fovCur += (fovTarget - this.fovCur) * Math.min(1, dt * 8);
        this.camera.fov = this.fovCur;
        this.camera.updateProjectionMatrix();
      }

      this.updateSky(dt);
      this.emitDebug(dt);
    }

    if (this.state === 'playing' || this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
    }
  };

  /** Sky objects + fog mode (sky / cave / underwater) with smoothing. */
  private updateSky(dt: number) {
    const eye = this.player.eyePosition();
    const preset = FOG_PRESETS[this.fogIdx];

    let tc: THREE.Color, tn: number, tf: number, tb: THREE.Color;
    if (this.player.eyeUnderWater) {
      tc = FOG_WATER; tn = 0.5; tf = 13; tb = FOG_WATER;
    } else if (this.world.colTop(Math.floor(eye.x), Math.floor(eye.z)) - eye.y > 5) {
      tc = FOG_CAVE; tn = 3; tf = 24; tb = BG_CAVE;
    } else {
      tc = FOG_SKY; tn = preset.near; tf = preset.far; tb = SKY_COLOR;
    }

    const k = 1 - Math.exp(-5 * dt);
    this.fogColor.lerp(tc, k);
    this.bgColor.lerp(tb, k);
    this.fogNear += (tn - this.fogNear) * k;
    this.fogFar += (tf - this.fogFar) * k;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.fogColor);
    fog.near = this.fogNear;
    fog.far = this.fogFar;

    this.sun.position.copy(this.camera.position).addScaledVector(SUN_DIR, 430);
    this.sun.lookAt(this.camera.position);

    this.clouds.position.set(this.camera.position.x, 78, this.camera.position.z);
    const mat = this.clouds.material as THREE.MeshBasicMaterial;
    const map = mat.map!;
    map.offset.set(
      (this.camera.position.x / 768 + this.tSec * 0.0011) % 1,
      (-this.camera.position.z / 768) % 1
    );
  }

  private emitDebug(dt: number) {
    if (!this.debugOn) return;
    this.debugTimer += dt;
    if (this.debugTimer < 0.25) return;
    this.debugTimer = 0;
    const p = this.player.pos;
    const yawDeg = ((this.player.yaw * 180) / Math.PI) % 360;
    const dirs = ['North (-Z)', 'West (-X)', 'South (+Z)', 'East (+X)'];
    const facing = dirs[Math.round((((360 - yawDeg) % 360) / 90)) % 4];
    const hit = this.rayTarget();
    const tb = hit ? `${BLOCKS[this.world.getBlock(hit.x, hit.y, hit.z)].name} (${hit.x}, ${hit.y}, ${hit.z})` : 'none';
    let tris = 0;
    try { tris = this.renderer.info.render.triangles; } catch { /* ignore */ }
    this.onMsg({
      t: 'debug',
      lines: [
        `${this.getVersion()} — ${this.fps} fps`,
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `Chunk: ${Math.floor(p.x / CH)}, ${Math.floor(p.z / CH)}  Facing: ${facing}`,
        `Targeted block: ${tb}`,
        `Fog: ${FOG_PRESETS[this.fogIdx].name} (${this.fogNear.toFixed(0)}-${this.fogFar.toFixed(0)})`,
        `Chunks: ${this.world.chunks.size} data / ${this.meshes.size} meshed`,
        `Tris: ${tris.toLocaleString()}  Particles: ${this.particles.active}`,
        `Seed: "${this.seedLabel}"`,
        this.player.inWater ? 'Swimming' : this.player.onGround ? 'On ground' : 'Airborne',
      ],
    });
  }

  dispose() {
    this.abort.abort();
    this.renderer.setAnimationLoop(null);
    this.disposeMeshes();
    this.renderer.dispose();
  }
}
