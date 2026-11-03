import type { Object3D, Texture } from 'three';
import type { Audio } from '../audio/Audio';
import { CONFIG } from '../config';
import { rand, randInt } from '../core/Tween';
import { SpriteBatch } from '../gfx/SpriteBatch';

const DEG = Math.PI / 180;

/** AttackMonster's six LightEffect slots: [x, y, rotation deg]. Each bolt sits 1.57 units out along its slot. */
const BOLT_SLOTS: readonly (readonly [number, number, number])[] = [
  [0, -0.44, 0],
  [0, 0.49, 180],
  [0.42, 0.22, 115],
  [-0.43, -0.22, -65],
  [0.4, -0.21, 57.6],
  [-0.4, 0.27, -122.4],
];
const BOLT_W = 1.66;
const BOLT_H = 2.72;
const BOLT_FRAMES = 11;
/** spriteVFXlaser222 at scale 3, centred 4.55 units below the monster. */
const LASER_W = 5.01;
const LASER_H = 10.26;
const LASER_DY = -4.55;
const LASER_FRAMES = 29;
const BALL = 1.02;

type Phase = 'idle' | 'charge' | 'hold' | 'fire' | 'fade';

/**
 * The monster's energy attack, as in attackRayMonster.cs: an energy ball swells in its eye
 * while bolts crackle around it, then a laser blasts the bow and hits the player four times.
 */
export class Attack {
  private readonly ball: SpriteBatch;
  private readonly bolts: SpriteBatch;
  private readonly laser: SpriteBatch;
  private readonly boltAge = new Float32Array(BOLT_SLOTS.length).fill(-1);
  private phase: Phase = 'idle';
  private t = 0;
  private nextBolt = 0;
  private ticks = 0;
  private fade = 1;
  used = false;

  constructor(
    parent: Object3D,
    tex: { energyBall: Texture; bolt: Texture; laser: Texture },
    private readonly audio: Audio,
    private readonly hooks: { onTick: () => void; onFire: () => void },
  ) {
    this.laser = new SpriteBatch({ texture: tex.laser, capacity: 1, order: 15, cols: 6, rows: 5, additive: true });
    this.bolts = new SpriteBatch({ texture: tex.bolt, capacity: BOLT_SLOTS.length, order: 16, cols: 4, rows: 3, additive: true });
    this.ball = new SpriteBatch({ texture: tex.energyBall, capacity: 2, order: 17 });
    parent.add(this.laser.mesh, this.bolts.mesh, this.ball.mesh);
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  get firing(): boolean {
    return this.phase === 'fire';
  }

  start(): void {
    if (this.used) return;
    this.used = true;
    this.phase = 'charge';
    this.t = 0;
    this.ticks = 0;
    this.fade = 1;
    this.nextBolt = 0.15;
    this.audio.play('charge', { volume: 0.75 });
  }

  /** The monster died mid-attack: everything fades out at once. */
  cancel(): void {
    if (this.phase === 'idle' || this.phase === 'fade') return;
    this.phase = 'fade';
    this.t = 0;
    this.audio.stopAll('charge');
  }

  reset(): void {
    this.phase = 'idle';
    this.used = false;
    this.boltAge.fill(-1);
  }

  update(dt: number): void {
    const { charge, hold, ticks, tickEvery } = CONFIG.attack;
    const { x, y } = CONFIG.monster;
    this.t += dt;
    let ballScale = 0;
    let laserFrame = -1;

    switch (this.phase) {
      case 'idle':
        break;
      case 'charge':
        ballScale = 0.2 + 0.8 * Math.min(1, this.t / charge);
        this.crackle(dt, 0.22, 0.5);
        if (this.t >= charge) {
          this.phase = 'hold';
          this.t = 0;
        }
        break;
      case 'hold':
        ballScale = 1 + Math.sin(this.t * 40) * 0.05;
        this.crackle(dt, 0.08, 0.2);
        if (this.t >= hold) {
          this.phase = 'fire';
          this.t = 0;
          this.hooks.onFire();
        }
        break;
      case 'fire': {
        ballScale = 1.05 + Math.sin(this.t * 50) * 0.06;
        laserFrame = Math.min(LASER_FRAMES - 1, Math.floor(this.t * 12));
        const due = Math.floor((this.t - 0.4) / tickEvery) + 1;
        while (this.ticks < Math.min(ticks, due)) {
          this.ticks++;
          this.hooks.onTick();
        }
        if (this.t >= LASER_FRAMES / 12) {
          this.phase = 'fade';
          this.t = 0;
        }
        break;
      }
      case 'fade':
        this.fade = Math.max(0, 1 - this.t / 0.3);
        ballScale = this.fade;
        if (this.fade <= 0) {
          this.phase = 'idle';
          this.boltAge.fill(-1);
        }
        break;
    }

    this.laser.begin();
    if (laserFrame >= 0) this.laser.push(x + 0.01, y + LASER_DY, 0, LASER_W, LASER_H, laserFrame, 1, 1, 1, 0.95);
    this.laser.commit();

    this.bolts.begin();
    for (let i = 0; i < BOLT_SLOTS.length; i++) {
      const age = this.boltAge[i];
      if (age < 0) continue;
      this.boltAge[i] = age + dt;
      const f = Math.floor(age * 12);
      if (f >= BOLT_FRAMES) {
        this.boltAge[i] = -1;
        continue;
      }
      const [sx, sy, rot] = BOLT_SLOTS[i];
      const r = rot * DEG;
      // The bolt's local offset (-0.06, 1.57) inside its rotated slot.
      const ox = -0.06 * Math.cos(r) - 1.57 * Math.sin(r);
      const oy = -0.06 * Math.sin(r) + 1.57 * Math.cos(r);
      this.bolts.push(x + sx + ox, y + sy + oy, r, BOLT_W, BOLT_H, f, 1, 1, 1, this.fade);
    }
    this.bolts.commit();

    this.ball.begin();
    if (ballScale > 0) {
      const s = BALL * ballScale;
      this.ball.push(x, y + 0.01, this.t * 3, s * 1.5, s * 1.5, 0, 0.8, 0.5, 1, 0.35 * this.fade);
      this.ball.push(x, y + 0.01, 0, s, s, 0, 1, 1, 1, this.fade);
    }
    this.ball.commit();
  }

  private crackle(dt: number, min: number, max: number): void {
    this.nextBolt -= dt;
    if (this.nextBolt > 0) return;
    this.nextBolt = rand(min, max);
    const slot = randInt(0, BOLT_SLOTS.length - 1);
    if (this.boltAge[slot] >= 0) return;
    this.boltAge[slot] = 0;
    this.audio.play(`zap${randInt(1, 3)}`, { volume: 0.45, minGap: 0.12 });
  }
}
