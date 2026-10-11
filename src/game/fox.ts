/**
 * The player character: a blocky red fox built from textured boxes.
 * Walk cycle, sprint lean, swim paddle, leap pose, mining paw-swipes,
 * plus a first-person foreleg that swings when you mine/place.
 */

import * as THREE from 'three';
import { getFoxTex } from './textures';
import type { Player } from './player';

type FaceSet = { px?: HTMLCanvasElement; nx?: HTMLCanvasElement; py?: HTMLCanvasElement; ny?: HTMLCanvasElement; pz?: HTMLCanvasElement; nz?: HTMLCanvasElement };

const matCache = new Map<HTMLCanvasElement, THREE.MeshBasicMaterial>();
function mat(cv: HTMLCanvasElement): THREE.MeshBasicMaterial {
  let m = matCache.get(cv);
  if (!m) {
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: tex });
    matCache.set(cv, m);
  }
  return m;
}

function boxMesh(w: number, h: number, d: number, faces: FaceSet): THREE.Mesh {
  const t = getFoxTex();
  const all = faces.px ?? t.furO;
  const mats = [
    mat(faces.px ?? all), mat(faces.nx ?? all), mat(faces.py ?? all),
    mat(faces.ny ?? all), mat(faces.pz ?? all), mat(faces.nz ?? all),
  ];
  const geo = new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(geo, mats);
}

/** Box whose pivot sits at its top (for legs) or base (for ears). */
function pivotBox(w: number, h: number, d: number, faces: FaceSet, pivot: 'top' | 'bottom'): THREE.Group {
  const g = new THREE.Group();
  const m = boxMesh(w, h, d, faces);
  m.position.y = pivot === 'top' ? -h / 2 : h / 2;
  g.add(m);
  return g;
}

export class FoxModel {
  /** world-space root (position = player feet, rotation.y = yaw). Faces -Z. */
  group = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private tail = new THREE.Group();
  private body!: THREE.Mesh;
  /** first-person paw */
  fpGroup = new THREE.Group();
  private fpArm!: THREE.Group;
  private phase = 0;
  private t = 0;
  private mineT = 0;
  private mining = false;
  private fpSwing = 0; // 0..1
  private prevYaw = 0;
  private lean = 0;

  constructor() {
    const t = getFoxTex();

    // ---- third-person model ----
    this.body = boxMesh(0.46, 0.42, 0.94, {
      px: t.bodySide, nx: t.bodySide, py: t.bodyTop, ny: t.furW, pz: t.furO, nz: t.furO,
    });
    this.body.position.set(0, 0.62, 0);
    this.torso.add(this.body);

    // white chest bib
    const chest = boxMesh(0.34, 0.26, 0.14, { px: t.furW, nx: t.furW, py: t.furW, ny: t.furW, pz: t.furW, nz: t.furW });
    chest.position.set(0, 0.5, -0.48);
    this.torso.add(chest);

    // head
    const headM = boxMesh(0.5, 0.46, 0.5, {
      px: t.furO, nx: t.furO, py: t.furO, ny: t.furO, pz: t.furO, nz: t.face,
    });
    headM.position.set(0, 0, -0.28);
    this.head.add(headM);

    // ears (pivot at bottom)
    const earGeoFaces = { px: t.earSide, nx: t.earSide, py: t.furB, ny: t.furO, pz: t.earFront, nz: t.earFront };
    const earL = pivotBox(0.14, 0.28, 0.1, earGeoFaces, 'bottom');
    earL.position.set(-0.16, 0.22, -0.3);
    const earR = pivotBox(0.14, 0.28, 0.1, earGeoFaces, 'bottom');
    earR.position.set(0.16, 0.22, -0.3);
    earL.rotation.x = -0.12;
    earR.rotation.x = -0.12;
    this.head.add(earL, earR);

    this.head.position.set(0, 0.85, -0.62);
    this.torso.add(this.head);

    // tail (pivot at base)
    const tailM = boxMesh(0.3, 0.3, 0.62, { px: t.furO, nx: t.furO, py: t.furO, ny: t.furO, pz: t.furO, nz: t.furO });
    tailM.position.set(0, 0, 0.32);
    const tailTip = boxMesh(0.32, 0.32, 0.2, { py: t.furW, ny: t.furW, px: t.furW, nx: t.furW, pz: t.furW, nz: t.furW });
    tailTip.position.set(0, 0, 0.6);
    this.tail.add(tailM, tailTip);
    this.tail.position.set(0, 0.76, 0.42);
    this.tail.rotation.x = -0.38;
    this.torso.add(this.tail);

    this.group.add(this.torso);

    // legs: FL, FR, BL, BR (pivot at hip = top)
    const legFaces = { px: t.leg, nx: t.leg, py: t.furO, ny: t.furB, pz: t.leg, nz: t.leg };
    const legPos: Array<[number, number]> = [[-0.15, -0.32], [0.15, -0.32], [-0.15, 0.34], [0.15, 0.34]];
    for (const [lx, lz] of legPos) {
      const leg = pivotBox(0.17, 0.5, 0.17, legFaces, 'top');
      leg.position.set(lx, 0.5, lz);
      this.legs.push(leg);
      this.group.add(leg);
    }

    // ---- first-person paw ----
    const arm = pivotBox(0.2, 0.24, 0.66, legFaces, 'top'); // reuse leg texture (black lower)
    arm.rotation.x = Math.PI / 2 + 0.25; // pointing forward/down
    const paw = boxMesh(0.22, 0.22, 0.12, { pz: t.furW, nz: t.furW, px: t.furO, nx: t.furO, py: t.furO, ny: t.furO });
    paw.position.set(0, -0.62, 0.06);
    arm.add(paw);
    this.fpArm = arm;
    this.fpArm.position.set(0.44, -0.32, -0.62);
    this.fpArm.rotation.set(Math.PI / 2 + 0.35, 0.35, 0.1);
    this.fpGroup.add(this.fpArm);
    this.fpGroup.visible = false;
  }

  setFirstPerson(fp: boolean) {
    this.group.visible = !fp;
    this.fpGroup.visible = fp;
  }

  setMining(mining: boolean) {
    this.mining = mining;
  }

  /** Trigger first-person paw swing (mine hit / place). */
  swing() {
    this.fpSwing = 1;
  }

  update(dt: number, player: Player) {
    this.t += dt;
    const sp = player.speed;
    const run = Math.min(sp / 6, 1);
    const moving = sp > 0.4;

    // body yaw follows camera
    this.group.position.copy(player.pos);
    this.group.rotation.y = player.yaw;
    const yawDelta = player.yaw - this.prevYaw;
    this.prevYaw = player.yaw;
    const targetLean = THREE.MathUtils.clamp(yawDelta / Math.max(dt, 1e-3) * -0.06, -0.18, 0.18);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

    // walk cycle
    if (player.inWater) {
      this.phase += dt * (6 + sp * 2);
    } else {
      this.phase += dt * (2.2 + sp * 2.1);
    }
    const amp = player.inWater
      ? 0.42
      : Math.min(sp / 4.4, 1.15) * 0.78;
    const swing = Math.sin(this.phase) * amp;
    const swing2 = Math.sin(this.phase + Math.PI) * amp;

    const lerpTo = (obj: THREE.Object3D, x: number, k: number) => {
      obj.rotation.x += (x - obj.rotation.x) * Math.min(1, dt * k);
    };

    if (!player.onGround && !player.inWater) {
      // leap pose
      lerpTo(this.legs[0], -0.55, 10);
      lerpTo(this.legs[1], -0.4, 10);
      lerpTo(this.legs[2], 0.65, 10);
      lerpTo(this.legs[3], 0.5, 10);
    } else {
      lerpTo(this.legs[0], swing, 18);
      lerpTo(this.legs[2], swing, 18);
      lerpTo(this.legs[1], swing2, 18);
      lerpTo(this.legs[3], swing2, 18);
    }

    // mining: right-front paw swipes
    if (this.mining) {
      this.mineT += dt;
      const sw = -Math.abs(Math.sin(this.mineT * 9)) * 0.9;
      this.legs[1].rotation.x = sw;
    }

    // torso: bob, breathing, sprint lean, strafe lean
    const bob = moving && player.onGround ? Math.abs(Math.sin(this.phase)) * 0.025 : 0;
    this.torso.position.y = bob;
    const breathe = 1 + Math.sin(this.t * 2.1) * 0.008;
    this.body.scale.set(1, breathe, 1);
    this.torso.rotation.x += ((player.inWater ? 0.12 : -run * 0.1) - this.torso.rotation.x) * Math.min(1, dt * 6);
    this.torso.rotation.z += (this.lean - this.torso.rotation.z) * Math.min(1, dt * 8);

    // head follows pitch a bit
    this.head.rotation.x += (THREE.MathUtils.clamp(player.pitch, -0.6, 0.6) * 0.55 - this.head.rotation.x) * Math.min(1, dt * 10);

    // tail: wag + streaming when running
    const wag = player.inWater ? 0.3 : 0.16 + run * 0.1;
    this.tail.rotation.y = Math.sin(this.t * (moving ? 6 : 1.4)) * wag;
    this.tail.rotation.x += ((player.inWater ? 0.05 : -0.38 - run * 0.22) - this.tail.rotation.x) * Math.min(1, dt * 5);

    // first-person paw: bob + swing decay
    this.fpSwing = Math.max(0, this.fpSwing - dt * 3.4);
    const s = Math.sin(this.fpSwing * Math.PI);
    const walkBob = moving && player.onGround ? Math.abs(Math.sin(this.phase)) * 0.03 : Math.sin(this.t * 1.8) * 0.006;
    this.fpArm.position.set(0.44, -0.32 + walkBob - s * 0.1, -0.62 + s * 0.12);
    this.fpArm.rotation.set(Math.PI / 2 + 0.35 - s * 0.9, 0.35, 0.1);
  }
}
