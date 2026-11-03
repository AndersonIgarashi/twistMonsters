import { CanvasTexture, LinearFilter, type Object3D } from 'three';
import { ease } from '../core/Tween';
import { SpriteBatch } from './SpriteBatch';

const GLYPHS = '0123456789-+';
const CELL_W = 72;
const CELL_H = 92;
const FONT = `${CELL_H * 0.8}px 'Lilita One', 'Arial Black', sans-serif`;

/** Fill gradients and outline per style: 0 hit on the monster, 1 damage to the player, 2 bonus. */
const STYLES = [
  { top: '#fff36b', bottom: '#ff6a1a', edge: '#3a0b2e' },
  { top: '#ff6b6b', bottom: '#c3001e', edge: '#fff2f2' },
  { top: '#b8ff7a', bottom: '#22c55e', edge: '#0b3a1e' },
] as const;
export type NumberStyle = 0 | 1 | 2;

interface Num {
  active: boolean;
  x: number;
  y: number;
  age: number;
  size: number;
  style: number;
  glyphs: number[];
  len: number;
  width: number;
}

/**
 * Floating damage numbers drawn from a glyph atlas rendered once with the game font.
 * One draw call for all of them, and no text is re-rasterised while playing.
 */
export class DamageNumbers {
  private readonly batch: SpriteBatch;
  private readonly advance: number[] = [];
  private readonly pool: Num[] = [];
  private readonly life = 1.0;

  constructor(parent: Object3D, order: number) {
    const canvas = document.createElement('canvas');
    canvas.width = CELL_W * GLYPHS.length;
    canvas.height = CELL_H * STYLES.length;
    const ctx = canvas.getContext('2d')!;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let s = 0; s < STYLES.length; s++) {
      const st = STYLES[s];
      const grad = ctx.createLinearGradient(0, s * CELL_H + CELL_H * 0.2, 0, s * CELL_H + CELL_H * 0.85);
      grad.addColorStop(0, st.top);
      grad.addColorStop(1, st.bottom);
      for (let g = 0; g < GLYPHS.length; g++) {
        const cx = g * CELL_W + CELL_W / 2;
        const cy = s * CELL_H + CELL_H / 2 + 3;
        ctx.lineWidth = 12;
        ctx.strokeStyle = st.edge;
        ctx.strokeText(GLYPHS[g], cx, cy);
        ctx.fillStyle = grad;
        ctx.fillText(GLYPHS[g], cx, cy);
      }
    }
    for (let g = 0; g < GLYPHS.length; g++) this.advance.push(Math.min(1, (ctx.measureText(GLYPHS[g]).width + 8) / CELL_W));
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    this.batch = new SpriteBatch({ texture, capacity: 64, order, cols: GLYPHS.length, rows: STYLES.length });
    parent.add(this.batch.mesh);
    for (let i = 0; i < 12; i++) this.pool.push({ active: false, x: 0, y: 0, age: 0, size: 1, style: 0, glyphs: [0, 0, 0, 0], len: 0, width: 0 });
  }

  /** `text` may only contain digits, '-' and '+'. `size` is the glyph height in world units. */
  spawn(text: string, x: number, y: number, style: NumberStyle, size = 0.62): void {
    let n = this.pool.find((p) => !p.active);
    if (!n) n = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
    n.active = true;
    n.x = x;
    n.y = y;
    n.age = 0;
    n.size = size;
    n.style = style;
    n.len = Math.min(4, text.length);
    n.width = 0;
    for (let i = 0; i < n.len; i++) {
      const g = Math.max(0, GLYPHS.indexOf(text[i]));
      n.glyphs[i] = g;
      n.width += this.advance[g];
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  update(dt: number): void {
    const b = this.batch;
    b.begin();
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      const t = n.age / this.life;
      if (t >= 1) {
        n.active = false;
        continue;
      }
      const pop = t < 0.18 ? ease.outBack(t / 0.18) : 1;
      const scale = n.size * (0.35 + 0.65 * pop) * (1 + Math.max(0, 0.18 - t) * 1.2);
      const rise = ease.outCubic(t) * 0.75;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const cellW = (CELL_W / CELL_H) * scale;
      let cx = n.x - (n.width * cellW) / 2;
      for (let i = 0; i < n.len; i++) {
        const adv = this.advance[n.glyphs[i]] * cellW;
        b.push(cx + adv / 2, n.y + rise, 0, cellW, scale, n.style * GLYPHS.length + n.glyphs[i], 1, 1, 1, alpha);
        cx += adv;
      }
    }
    b.commit();
  }
}
