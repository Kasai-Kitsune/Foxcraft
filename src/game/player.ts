/**
 * Fox player physics: AABB voxel collision, jumping, swimming, sprinting.
 * Camera control (first/third person) with third-person camera collision.
 */

import * as THREE from 'three';
import { World, WH } from './world';
import { B, BLOCKS } from './blocks';

export interface MoveInput {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  // touch joystick (-1..1)
  jx: number;
  jy: number;
}

const HALF = 0.3;   // half width
const HEIGHT = 0.95;
const EYE = 0.85;

const WALK = 4.4;
const SPRINT = 6.0;
const SWIM = 2.7;
const GRAVITY = 30;
const JUMP_V = 8.8;
const WATER_G = 5;
const SWIM_UP = 15;

export class Player {
  pos = new THREE.Vector3(8, 40, 8); // feet center
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  inWater = false;
  eyeUnderWater = false;
  sprinting = false;
  /** horizontal speed (for animation) */
  speed = 0;
  /** block id under feet (for footstep sounds) */
  groundBlock: number = B.GRASS;
  private waterHopCooldown = 0;

  eyePosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  forward(target = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt: number, input: MoveInput, world: World) {
    const eyeB = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    const bodyB = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.45), Math.floor(this.pos.z));
    this.eyeUnderWater = eyeB === B.WATER;
    const wasInWater = this.inWater;
    this.inWater = bodyB === B.WATER || this.eyeUnderWater;
    if (this.inWater && !wasInWater && this.vel.y < -6) this.vel.y = -3; // splash-in dampening

    // move intent (keyboard + touch joystick)
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.jx;
    let mz = (input.fwd ? 1 : 0) - (input.back ? 1 : 0) + input.jy;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) { mx /= mlen; mz /= mlen; }
    const moving = mlen > 0.05;

    this.sprinting = input.sprint && moving && !this.inWater;
    const speed = this.inWater ? SWIM : this.sprinting ? SPRINT : WALK;

    // camera-relative direction
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * mz + cy * mx) * speed;
    const tz = (-cy * mz - sy * mx) * speed;
    const k = this.onGround || this.inWater ? 14 : 3.2;
    const blend = 1 - Math.exp(-k * dt);
    this.vel.x += (tx - this.vel.x) * blend;
    this.vel.z += (tz - this.vel.z) * blend;

    // vertical
    if (this.inWater) {
      this.vel.y -= WATER_G * dt;
      this.vel.y *= Math.exp(-1.6 * dt); // drag
      if (input.jump) this.vel.y = Math.min(this.vel.y + SWIM_UP * dt, 3.4);
      // hop out of water when pressing forward against a wall
      this.waterHopCooldown -= dt;
      if (input.jump && moving && this.waterHopCooldown <= 0) {
        const fx = Math.floor(this.pos.x + Math.sign(this.vel.x) * 0.7);
        const fz = Math.floor(this.pos.z + Math.sign(this.vel.z) * 0.7);
        const fy = Math.floor(this.pos.y);
        if (world.isSolid(fx, fy, fz) && !world.isSolid(fx, fy + 1, fz)) {
          this.vel.y = 6.6;
          this.waterHopCooldown = 0.5;
        }
      }
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
      }
    }
    this.vel.y = Math.max(this.vel.y, -42);

    // integrate + resolve per axis
    this.onGround = false;
    this.moveAxis(0, this.vel.x * dt, world);
    this.moveAxis(1, this.vel.y * dt, world);
    this.moveAxis(2, this.vel.z * dt, world);

    if (this.pos.y < -8) this.pos.y = WH + 2; // safety (shouldn't happen)

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) {
      this.groundBlock = world.getBlock(
        Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z)
      );
    }
  }

  private moveAxis(axis: 0 | 1 | 2, delta: number, world: World) {
    if (delta === 0) return;
    const p = this.pos;
    if (axis === 0) p.x += delta;
    else if (axis === 1) p.y += delta;
    else p.z += delta;

    const minX = Math.floor(p.x - HALF), maxX = Math.floor(p.x + HALF);
    const minY = Math.floor(p.y), maxY = Math.floor(p.y + HEIGHT);
    const minZ = Math.floor(p.z - HALF), maxZ = Math.floor(p.z + HALF);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (!world.isSolid(x, y, z)) continue;
          // resolve on current axis
          if (axis === 0) {
            if (delta > 0) p.x = x - HALF - 0.001;
            else p.x = x + 1 + HALF + 0.001;
            this.vel.x = 0;
          } else if (axis === 1) {
            if (delta > 0) {
              p.y = y - HEIGHT - 0.001;
              this.vel.y = 0;
            } else {
              p.y = y + 1 + 0.001;
              this.vel.y = 0;
              this.onGround = true;
            }
          } else {
            if (delta > 0) p.z = z - HALF - 0.001;
            else p.z = z + 1 + HALF + 0.001;
            this.vel.z = 0;
          }
          // re-evaluate bounds after push-out
          return;
        }
      }
    }
  }

  /** Third-person camera position with terrain collision (ray-march back from head). */
  thirdPersonCamera(camera: THREE.PerspectiveCamera, world: World) {
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z);
    const back = this.forward().negate();
    let dist = 4.3;
    const step = 0.2;
    for (let d = step; d <= 4.3; d += step) {
      const px = target.x + back.x * d, py = target.y + back.y * d, pz = target.z + back.z * d;
      if (world.isSolid(Math.floor(px), Math.floor(py), Math.floor(pz))) {
        dist = Math.max(0.6, d - 0.35);
        break;
      }
    }
    camera.position.set(target.x + back.x * dist, target.y + back.y * dist, target.z + back.z * dist);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
  }

  firstPersonCamera(camera: THREE.PerspectiveCamera) {
    this.eyePosition(camera.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
  }

  /** Does the player's AABB overlap this block cell? (for placement checks) */
  intersectsCell(x: number, y: number, z: number): boolean {
    return (
      x + 1 > this.pos.x - HALF && x < this.pos.x + HALF &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT &&
      z + 1 > this.pos.z - HALF && z < this.pos.z + HALF
    );
  }
}

export const PLAYER_HEIGHT = HEIGHT;
export { BLOCKS };
