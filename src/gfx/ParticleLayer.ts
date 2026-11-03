import type { Object3D, Texture } from 'three';
import { SpriteBatch } from './SpriteBatch';

export interface SpawnOptions {
  vx?: number;
  vy?: number;
  rot?: number;
  spin?: number;
  w: number;
  h?: number;
  life: number;
  gravity?: number;
  drag?: number;
  frame?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  /** Size multiplier reached at the end of life (1 keeps the size). */
  endScale?: number;
  /** Fraction of life spent fading in from zero. */
  fadeIn?: number;
  /** Fraction of life at which the fade-out starts. */
  fadeOut?: number;
  /** Pop in with a quick overshoot instead of appearing at full size. */
  pop?: boolean;
}

class Particle {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  rot = 0;
  spin = 0;
  w = 0;
  h = 0;
  life = 1;
  age = 0;
  gravity = 0;
  drag = 0;
  frame = 0;
  r = 1;
  g = 1;
  b = 1;
  a = 1;
  endScale = 1;
  fadeIn = 0;
  fadeOut = 0.6;
  pop = false;
}

/** A fixed pool of simple ballistic particles drawn with one SpriteBatch. Spawning reuses dead slots; nothing is allocated after construction. */
export class ParticleLayer {
  readonly batch: SpriteBatch;
  private readonly pool: Particle[];

  constructor(parent: Object3D, texture: Texture, capacity: number, order: number, opts: { additive?: boolean; cols?: number; rows?: number } = {}) {
    this.batch = new SpriteBatch({ texture, capacity, order, additive: opts.additive, cols: opts.cols, rows: opts.rows });
    parent.add(this.batch.mesh);
    this.pool = Array.from({ length: capacity }, () => new Particle());
  }

  spawn(x: number, y: number, o: SpawnOptions): void {
    const pool = this.pool;
    let p: Particle | undefined;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        p = pool[i];
        break;
      }
    }
    if (!p) {
      // Pool full: recycle the oldest particle rather than dropping the new one.
      p = pool[0];
      for (let i = 1; i < pool.length; i++) if (pool[i].age / pool[i].life > p.age / p.life) p = pool[i];
    }
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.rot = o.rot ?? 0;
    p.spin = o.spin ?? 0;
    p.w = o.w;
    p.h = o.h ?? o.w;
    p.life = o.life;
    p.age = 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.frame = o.frame ?? 0;
    p.r = o.r ?? 1;
    p.g = o.g ?? 1;
    p.b = o.b ?? 1;
    p.a = o.a ?? 1;
    p.endScale = o.endScale ?? 1;
    p.fadeIn = o.fadeIn ?? 0;
    p.fadeOut = o.fadeOut ?? 0.6;
    p.pop = o.pop ?? false;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  update(dt: number): void {
    const batch = this.batch;
    const pool = this.pool;
    batch.begin();
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.active = false;
        continue;
      }
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      let alpha = p.a;
      if (p.fadeIn > 0 && t < p.fadeIn) alpha *= t / p.fadeIn;
      if (t > p.fadeOut) alpha *= 1 - (t - p.fadeOut) / (1 - p.fadeOut);
      let s = 1 + (p.endScale - 1) * t;
      if (p.pop) s *= t < 0.12 ? (t / 0.12) * 1.25 : 1 + 0.25 * Math.max(0, 1 - (t - 0.12) / 0.15);
      batch.push(p.x, p.y, p.rot, p.w * s, p.h * s, p.frame, p.r, p.g, p.b, alpha);
    }
    batch.commit();
  }
}
