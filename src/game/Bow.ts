import type { Object3D, Texture } from 'three';
import { CONFIG } from '../config';
import { rand } from '../core/Tween';
import { ParticleLayer } from '../gfx/ParticleLayer';
import { SpriteBatch } from '../gfx/SpriteBatch';

export interface Flying {
  active: boolean;
  y: number;
  /** Already tested against the tails of the stuck arrows. */
  passedTails: boolean;
}

/** Arch.png / ArchReadyToShoot.png are 498 x 338 px. */
const BOW_ASPECT = 338 / 498;
const DRAW_PULL = 0.32;

/**
 * The player's bow: idle and drawn sprites, the nocked arrow, arrows in flight and the
 * pieces of broken ones. The nocked arrow slides back in after each shot (the reload).
 */
export class Bow {
  private readonly bowIdle: SpriteBatch;
  private readonly bowDrawn: SpriteBatch;
  private readonly arrows: SpriteBatch;
  readonly brokenTip: ParticleLayer;
  readonly brokenTail: ParticleLayer;
  readonly loose: ParticleLayer;
  readonly flying: Flying[] = [];
  drawn = false;
  private draw = 0;
  private reload = 1;
  private kick = 0;
  hasArrow = true;
  visible = true;

  constructor(parent: Object3D, tex: { bowIdle: Texture; bowDrawn: Texture; arrow: Texture; arrowBroken1: Texture; arrowBroken2: Texture }) {
    this.loose = new ParticleLayer(parent, tex.arrow, 40, 9);
    this.arrows = new SpriteBatch({ texture: tex.arrow, capacity: 6, order: 18 });
    this.bowIdle = new SpriteBatch({ texture: tex.bowIdle, capacity: 1, order: 19 });
    this.bowDrawn = new SpriteBatch({ texture: tex.bowDrawn, capacity: 1, order: 19 });
    this.brokenTip = new ParticleLayer(parent, tex.arrowBroken1, 12, 20);
    this.brokenTail = new ParticleLayer(parent, tex.arrowBroken2, 12, 20);
    parent.add(this.arrows.mesh, this.bowIdle.mesh, this.bowDrawn.mesh);
    for (let i = 0; i < 4; i++) this.flying.push({ active: false, y: 0, passedTails: false });
  }

  reset(): void {
    for (const f of this.flying) f.active = false;
    this.brokenTip.clear();
    this.brokenTail.clear();
    this.loose.clear();
    this.drawn = false;
    this.draw = 0;
    this.reload = 1;
    this.hasArrow = true;
    this.visible = true;
  }

  get inFlight(): boolean {
    for (let i = 0; i < this.flying.length; i++) if (this.flying[i].active) return true;
    return false;
  }

  get ready(): boolean {
    return this.reload >= 1 && this.hasArrow;
  }

  /** Launches the nocked arrow. Returns false while still reloading. */
  fire(): boolean {
    if (!this.ready) return false;
    const slot = this.flying.find((f) => !f.active);
    if (!slot) return false;
    slot.active = true;
    slot.y = CONFIG.arrow.restY - this.draw * DRAW_PULL;
    slot.passedTails = false;
    this.reload = 0;
    this.kick = 1;
    this.drawn = false;
    return true;
  }

  /** Splits an arrow into its two halves (flechaQuebrada1/2), tumbling away under gravity. */
  shatter(x: number, y: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.brokenTip.spawn(x + 0.05 * side, y + 0.25, {
      w: CONFIG.arrow.w, h: 0.654, vx: side * rand(1.2, 2.2), vy: rand(2.2, 3.4), rot: rand(-0.4, 0.4), spin: side * rand(6, 11),
      gravity: rand(9, 16), life: 1.3, fadeOut: 0.55,
    });
    this.brokenTail.spawn(x - 0.05 * side, y - 0.3, {
      w: CONFIG.arrow.w, h: 0.697, vx: -side * rand(1, 2), vy: rand(1.4, 2.6), rot: rand(-0.4, 0.4), spin: -side * rand(5, 10),
      gravity: rand(9, 16), life: 1.3, fadeOut: 0.55,
    });
  }

  /** A whole arrow knocked loose (when the monster dies). */
  launchLoose(x: number, y: number, outward: number): void {
    const speed = rand(3.5, 6);
    this.loose.spawn(x, y, {
      w: CONFIG.arrow.w, h: CONFIG.arrow.h, vx: Math.cos(outward) * speed, vy: Math.sin(outward) * speed + 2,
      rot: outward - Math.PI / 2, spin: rand(-9, 9), gravity: 12, life: 1.6, fadeOut: 0.6,
    });
  }

  update(dt: number): void {
    const { restY, speed, w, h, cooldown } = CONFIG.arrow;
    const target = this.drawn ? 1 : 0;
    this.draw += (target - this.draw) * Math.min(1, dt * (this.drawn ? 22 : 30));
    this.reload = Math.min(1, this.reload + dt / cooldown);
    this.kick = Math.max(0, this.kick - dt * 5);

    this.arrows.begin();
    for (let i = 0; i < this.flying.length; i++) {
      const f = this.flying[i];
      if (!f.active) continue;
      f.y += speed * dt;
      if (f.y > 8) f.active = false;
      else this.arrows.push(0, f.y, 0, w, h * 1.06, 0);
    }
    if (this.hasArrow && this.visible) {
      // Reload: the next arrow rises out of the quiver below the bow and settles on the string.
      const r = this.reload;
      const rise = r < 1 ? (1 - r) * (1 - r) * 0.9 : 0;
      this.arrows.push(0, restY - this.draw * DRAW_PULL - rise, 0, w, h, 0, 1, 1, 1, Math.min(1, r * 1.6));
    }
    this.arrows.commit();

    // Squash & stretch: the limbs compress while drawing and spring wide on release.
    const { y: by, w: bw } = CONFIG.bow;
    const k = this.kick;
    const spring = Math.sin(k * Math.PI * 3) * k * 0.08;
    const sx = bw * (1 - this.draw * 0.05 + spring);
    const sy = bw * BOW_ASPECT * (1 + this.draw * 0.04 - spring * 0.6);
    const shown = this.drawn || this.draw > 0.5;
    this.bowIdle.begin();
    this.bowDrawn.begin();
    if (this.visible) (shown ? this.bowDrawn : this.bowIdle).push(0, by, 0, sx, sy);
    this.bowIdle.commit();
    this.bowDrawn.commit();

    this.brokenTip.update(dt);
    this.brokenTail.update(dt);
    this.loose.update(dt);
  }
}
