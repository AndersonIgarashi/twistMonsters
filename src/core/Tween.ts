export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} satisfies Record<string, Ease>;

interface Tween {
  duration: number;
  delay: number;
  elapsed: number;
  ease: Ease;
  update: (t: number) => void;
  done?: () => void;
  owner: object | null;
  dead: boolean;
}

interface Timer {
  at: number;
  fn: () => void;
  owner: object | null;
  dead: boolean;
}

/** Time-based tweens and timers driven by the game loop. Finished entries are removed in place, so steady play allocates nothing. */
export class Tweener {
  private readonly tweens: Tween[] = [];
  private readonly timers: Timer[] = [];
  time = 0;

  to(duration: number, update: (t: number) => void, opts: { ease?: Ease; delay?: number; owner?: object; done?: () => void } = {}): void {
    this.tweens.push({
      duration: Math.max(1e-4, duration),
      delay: opts.delay ?? 0,
      elapsed: 0,
      ease: opts.ease ?? ease.outQuad,
      update,
      done: opts.done,
      owner: opts.owner ?? null,
      dead: false,
    });
  }

  after(seconds: number, fn: () => void, owner: object | null = null): void {
    this.timers.push({ at: this.time + seconds, fn, owner, dead: false });
  }

  /** Safe to call from inside a tween or timer callback: entries are flagged and dropped on the next pass. */
  kill(owner: object): void {
    for (const t of this.tweens) if (t.owner === owner) t.dead = true;
    for (const t of this.timers) if (t.owner === owner) t.dead = true;
  }

  clear(): void {
    for (const t of this.tweens) t.dead = true;
    for (const t of this.timers) t.dead = true;
  }

  update(dt: number): void {
    this.time += dt;
    const list = this.tweens;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const tw = list[i];
      if (tw.dead) continue;
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) {
          list[w++] = tw;
          continue;
        }
        tw.elapsed = -tw.delay;
        tw.delay = 0;
      } else {
        tw.elapsed += dt;
      }
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.ease(t));
      if (t < 1) list[w++] = tw;
      else tw.done?.();
    }
    list.length = w;

    const timers = this.timers;
    let k = 0;
    const count = timers.length;
    for (let i = 0; i < count; i++) {
      const tm = timers[i];
      if (tm.dead) continue;
      if (tm.at <= this.time) tm.fn();
      else timers[k++] = tm;
    }
    // Timers scheduled from inside a callback were pushed past `count`; keep them.
    for (let i = count; i < timers.length; i++) if (!timers[i].dead) timers[k++] = timers[i];
    timers.length = k;
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (current: number, target: number, rate: number, dt: number) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
