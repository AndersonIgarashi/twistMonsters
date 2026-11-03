import type { Object3D, Texture } from 'three';
import { ease, rand } from '../core/Tween';
import { ParticleLayer, type SpawnOptions } from '../gfx/ParticleLayer';
import { SpriteBatch } from '../gfx/SpriteBatch';

interface Soul {
  active: boolean;
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds of free floating before homing (staggered per soul). */
  float: number;
  homing: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  phase: number;
  trail: number;
}

const HOME_TIME = 0.55;
/** Reused for every trail spark, so the homing flight allocates nothing. */
const TRAIL: SpawnOptions = { w: 0.42, life: 0.32, endScale: 0.2, r: 0.55, g: 0.8, b: 1, a: 0.85, rot: 0 };

/**
 * The souls a defeated monster releases. They burst out, float and pulse like the original
 * (scale 0.4 - 0.8), then curve into the souls counter, leaving a short glowing trail.
 */
export class Souls {
  private readonly glow: SpriteBatch;
  private readonly icon: SpriteBatch;
  private readonly trail: ParticleLayer;
  private readonly souls: Soul[] = [];
  private target = { x: 2.4, y: -1.6 };

  constructor(parent: Object3D, tex: { soul: Texture; soulGlow: Texture; sparkle: Texture }, private readonly onArrive: (index: number) => void) {
    this.trail = new ParticleLayer(parent, tex.sparkle, 160, 23, { additive: true });
    this.glow = new SpriteBatch({ texture: tex.soulGlow, capacity: 16, order: 24, additive: true });
    this.icon = new SpriteBatch({ texture: tex.soul, capacity: 16, order: 25 });
    parent.add(this.glow.mesh, this.icon.mesh);
    for (let i = 0; i < 16; i++) {
      this.souls.push({ active: false, age: 0, x: 0, y: 0, vx: 0, vy: 0, float: 0, homing: -1, sx: 0, sy: 0, cx: 0, cy: 0, phase: 0, trail: 0 });
    }
  }

  setTarget(x: number, y: number): void {
    this.target.x = x;
    this.target.y = y;
  }

  burst(x: number, y: number, count: number): void {
    for (let i = 0; i < Math.min(count, this.souls.length); i++) {
      const s = this.souls[i];
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const speed = rand(2.4, 4.2);
      s.active = true;
      s.age = 0;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(a) * speed;
      s.vy = Math.sin(a) * speed + 0.6;
      s.float = 0.75 + i * 0.075;
      s.homing = -1;
      s.phase = rand(0, Math.PI * 2);
      s.trail = 0;
    }
  }

  clear(): void {
    for (const s of this.souls) s.active = false;
    this.trail.clear();
  }

  get busy(): boolean {
    return this.souls.some((s) => s.active);
  }

  update(dt: number): void {
    this.glow.begin();
    this.icon.begin();
    for (let i = 0; i < this.souls.length; i++) {
      const s = this.souls[i];
      if (!s.active) continue;
      s.age += dt;
      let size = 0.6 + 0.2 * Math.sin(s.age * 6 + s.phase);
      if (s.homing < 0) {
        const k = Math.exp(-3.2 * dt);
        s.vx *= k;
        s.vy = s.vy * k + 0.35 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.age >= s.float) {
          s.homing = 0;
          s.sx = s.x;
          s.sy = s.y;
          // Bend the flight sideways so the souls arrive in a swirl, not a straight line.
          const dx = this.target.x - s.x;
          const dy = this.target.y - s.y;
          const bend = (i % 2 ? 1 : -1) * rand(0.25, 0.45);
          s.cx = s.x + dx * 0.5 - dy * bend;
          s.cy = s.y + dy * 0.5 + dx * bend;
        }
      } else {
        s.homing += dt / HOME_TIME;
        const t = ease.inQuad(Math.min(1, s.homing));
        const u = 1 - t;
        s.x = u * u * s.sx + 2 * u * t * s.cx + t * t * this.target.x;
        s.y = u * u * s.sy + 2 * u * t * s.cy + t * t * this.target.y;
        size *= 1 - 0.45 * t;
        s.trail += dt;
        if (s.trail > 0.025) {
          s.trail = 0;
          TRAIL.rot = rand(0, 6.28);
          this.trail.spawn(s.x, s.y, TRAIL);
        }
        if (s.homing >= 1) {
          s.active = false;
          this.onArrive(i);
          continue;
        }
      }
      const appear = Math.min(1, s.age / 0.15);
      this.glow.push(s.x, s.y, s.age * 2.5, 1.5 * size * appear, 1.5 * size * appear, 0, 0.6, 0.85, 1, 0.9);
      this.icon.push(s.x, s.y, Math.sin(s.age * 3 + s.phase) * 0.25, 0.77 * size * 1.25 * appear, 0.54 * size * 1.25 * appear);
    }
    this.glow.commit();
    this.icon.commit();
    this.trail.update(dt);
  }
}
