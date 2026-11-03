import { Group, type Texture } from 'three';
import { CONFIG } from '../config';
import { ease } from '../core/Tween';
import { SpriteBatch } from '../gfx/SpriteBatch';

const DEG = Math.PI / 180;

/**
 * MonstroLVL1-3-5 from level.unity: [x, y, rotation deg, scale] of each spriteTentaculo (254 x 215 px).
 * Every second one has flipX + flipY on its SpriteRenderer, which is the same as turning it 180°,
 * so each pair shares a rotation but both thin tips point away from the body.
 */
const TENTACLES: readonly (readonly [number, number, number, number])[] = [
  [-1.34, -0.63, 0, 0.6],
  [1.22, 0.71, 0 + 180, 0.6],
  [0.68, -1.29, 90, 0.6],
  [-0.7, 1.25, 90 + 180, 0.6],
  [-0.6, -1.33, 41.6, 0.6],
  [0.4, 1.34, 41.6 + 180, 0.6],
  [1.34, -0.48, 131.6, 0.6],
  [-1.34, 0.5, 131.6 + 180, 0.6],
];
const TENTACLE_W = 2.54;
const TENTACLE_H = 2.15;
const BODY = 3.34 * 0.64;
const EYE = 1.83 * 0.6;
const BLINK_EVERY = 3.6;
const MAX_ARROWS = 40;

interface StuckArrow {
  /** Angle around the monster, in its local frame (radians). */
  angle: number;
  wobble: number;
}

export class Monster {
  readonly group = new Group();
  readonly eyeGroup = new Group();
  private readonly tentacles: SpriteBatch;
  private readonly arrows: SpriteBatch;
  private readonly body: SpriteBatch;
  private readonly eyeWhite: SpriteBatch;
  private readonly lids: SpriteBatch;
  private readonly stuck: StuckArrow[] = [];
  rotation = 0;
  spin = CONFIG.monster.spin * DEG;
  private time = 0;
  private blinkAt = 1.2;
  private punch = 0;
  private dying = -1;
  scale = 1;

  constructor(tex: Record<'tentacle' | 'body' | 'arrow' | 'eye' | 'eyeWhite', Texture>) {
    this.tentacles = new SpriteBatch({ texture: tex.tentacle, capacity: TENTACLES.length, order: 10, cols: 4, rows: 2 });
    this.arrows = new SpriteBatch({ texture: tex.arrow, capacity: MAX_ARROWS, order: 11 });
    this.body = new SpriteBatch({ texture: tex.body, capacity: 1, order: 12 });
    this.eyeWhite = new SpriteBatch({ texture: tex.eyeWhite, capacity: 1, order: 13 });
    this.lids = new SpriteBatch({ texture: tex.eye, capacity: 1, order: 14, cols: 4, rows: 2 });
    this.group.add(this.tentacles.mesh, this.arrows.mesh, this.body.mesh);
    this.eyeGroup.add(this.eyeWhite.mesh, this.lids.mesh);
    this.reset();
  }

  reset(): void {
    this.stuck.length = 0;
    this.rotation = 0;
    this.spin = CONFIG.monster.spin * DEG;
    this.punch = 0;
    this.dying = -1;
    this.scale = 1;
    this.group.visible = true;
    this.eyeGroup.visible = true;
  }

  get alive(): boolean {
    return this.dying < 0;
  }

  get arrowCount(): number {
    return this.stuck.length;
  }

  /** Local angle currently facing straight down, where the player's arrows arrive. */
  get bottomAngle(): number {
    return -Math.PI / 2 - this.rotation;
  }

  /** Is an already-stuck arrow within `gapDeg` of the bottom of the monster? */
  blockedAtBottom(gapDeg: number): boolean {
    const target = this.bottomAngle;
    const gap = gapDeg * DEG;
    for (let i = 0; i < this.stuck.length; i++) {
      let d = (this.stuck[i].angle - target) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < gap) return true;
    }
    return false;
  }

  stickAtBottom(): void {
    if (this.stuck.length < MAX_ARROWS) this.stuck.push({ angle: this.bottomAngle, wobble: 1 });
    this.punch = 1;
    this.blinkAt = Math.min(this.blinkAt, this.time);
  }

  /** World-space centre and outward angle of every stuck arrow, for the death pop. */
  forEachArrow(fn: (x: number, y: number, outward: number) => void): void {
    const r = CONFIG.monster.radius - CONFIG.monster.embed + CONFIG.arrow.h / 2;
    for (const a of this.stuck) {
      const w = a.angle + this.rotation;
      fn(CONFIG.monster.x + Math.cos(w) * r * this.scale, CONFIG.monster.y + Math.sin(w) * r * this.scale, w);
    }
  }

  die(): void {
    if (this.dying >= 0) return;
    this.dying = 0;
  }

  /** Arrows leave the body when the monster dies. */
  clearArrows(): void {
    this.stuck.length = 0;
  }

  update(dt: number): void {
    this.time += dt;
    const { x, y, radius, embed, deathTime } = CONFIG.monster;

    if (this.dying >= 0) {
      this.dying += dt;
      const t = Math.min(1, this.dying / deathTime);
      this.spin = (CONFIG.monster.spin + 620 * ease.inQuad(t)) * DEG;
      this.scale = 1 - ease.inBack(t);
      if (t >= 1) {
        this.group.visible = false;
        this.eyeGroup.visible = false;
      }
    }
    this.rotation += this.spin * dt;

    // Hit punch: a quick squash then stretch, settling with a small overshoot.
    this.punch = Math.max(0, this.punch - dt * 4.5);
    const p = this.punch;
    const squash = Math.sin(p * Math.PI * 2.5) * p * 0.09;
    const sx = this.scale * (1 + squash);
    const sy = this.scale * (1 - squash);

    this.group.position.set(x, y, 0);
    this.group.rotation.z = this.rotation;
    this.group.scale.set(sx, sy, 1);
    this.eyeGroup.position.set(x, y + 0.01 * this.scale, 0);
    this.eyeGroup.scale.set(sx, sy, 1);

    const frame = Math.floor(this.time * 12);
    this.tentacles.begin();
    for (let i = 0; i < TENTACLES.length; i++) {
      const t = TENTACLES[i];
      // Each tentacle starts its 7-frame loop at a different point so they never wave in unison.
      this.tentacles.push(t[0], t[1], t[2] * DEG, TENTACLE_W * t[3], TENTACLE_H * t[3], (frame + i * 3) % 7);
    }
    this.tentacles.commit();

    const r = radius - embed + CONFIG.arrow.h / 2;
    this.arrows.begin();
    for (let i = 0; i < this.stuck.length; i++) {
      const a = this.stuck[i];
      a.wobble = Math.max(0, a.wobble - dt * 3.2);
      const wob = Math.sin(a.wobble * 34) * a.wobble * 0.09;
      const ang = a.angle + wob;
      this.arrows.push(Math.cos(a.angle) * r, Math.sin(a.angle) * r, ang + Math.PI / 2, CONFIG.arrow.w, CONFIG.arrow.h);
    }
    this.arrows.commit();

    this.body.begin();
    this.body.push(0, -0.01, 0, BODY, BODY);
    this.body.commit();

    this.eyeWhite.begin();
    this.eyeWhite.push(0, 0, 0, EYE, EYE);
    this.eyeWhite.commit();

    // Blink: the 7-frame lid animation at 12 fps every 3.6 s, and right after every hit.
    this.lids.begin();
    if (this.dying < 0 && this.time >= this.blinkAt) {
      const f = Math.floor((this.time - this.blinkAt) * 12);
      if (f < 7) this.lids.push(0, 0.012, 0, EYE * 1.01, EYE, f);
      else this.blinkAt = this.time + BLINK_EVERY;
    }
    this.lids.commit();
  }
}
