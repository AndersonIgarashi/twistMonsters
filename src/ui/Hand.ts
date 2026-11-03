import { images } from '../core/assets';
import { el } from './Hud';

/** Fingertip position inside the hand image (fractions of its box). */
const HOTSPOT = { x: 16 / 128, y: 5 / 128 } as const;

type Target = { kind: 'point'; x: number; y: number } | { kind: 'element'; node: HTMLElement };

/** The tutorial hand. It points at a spot in the game (frame-relative px) or at a DOM element, and stays above everything. */
export class Hand {
  readonly root: HTMLElement;
  private target: Target | null = null;

  constructor(private readonly frame: HTMLElement) {
    this.root = el('div', 'hand', { 'aria-hidden': 'true' }, [
      el('span', 'hand__ripple'),
      el('img', 'hand__img', { src: images['hand-tutorial'], alt: '', draggable: 'false' }),
    ]);
    frame.append(this.root);
  }

  get visible(): boolean {
    return this.target !== null;
  }

  pointAt(x: number, y: number): void {
    this.target = { kind: 'point', x, y };
    this.reposition();
    this.root.classList.add('is-visible');
  }

  pointAtElement(node: HTMLElement): void {
    this.target = { kind: 'element', node };
    this.reposition();
    this.root.classList.add('is-visible');
  }

  hide(): void {
    this.target = null;
    this.root.classList.remove('is-visible');
  }

  reposition(): void {
    const t = this.target;
    if (!t) return;
    let x: number;
    let y: number;
    if (t.kind === 'point') {
      x = t.x;
      y = t.y;
    } else {
      const fr = this.frame.getBoundingClientRect();
      const r = t.node.getBoundingClientRect();
      x = r.left - fr.left + r.width * 0.62;
      y = r.top - fr.top + r.height * 0.6;
    }
    const size = this.root.offsetWidth;
    this.root.style.transform = `translate(${Math.round(x - size * HOTSPOT.x)}px, ${Math.round(y - size * HOTSPOT.y)}px)`;
  }
}
