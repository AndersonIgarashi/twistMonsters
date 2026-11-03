import { images } from '../core/assets';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

const img = (name: string, className = '') => el('img', className, { src: images[name], alt: '', draggable: 'false' });

const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

class LifeBar {
  readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly text: HTMLElement;

  constructor(kind: 'player' | 'monster') {
    this.fill = el('div', 'bar__fill');
    this.ghost = el('div', 'bar__ghost');
    this.text = el('span', 'bar__text');
    this.root = el('div', `bar bar--${kind}`, {}, [
      img(kind === 'player' ? 'iconHeart' : 'iconMonster', 'bar__icon'),
      el('div', 'bar__track', {}, [this.ghost, this.fill]),
      this.text,
    ]);
  }

  set(value: number, max: number, hit = false): void {
    const k = Math.max(0, Math.min(1, value / max));
    this.fill.style.transform = `scaleY(${k})`;
    this.ghost.style.transform = `scaleY(${k})`;
    this.text.textContent = `${max}-${Math.max(0, Math.round(value))}`;
    if (hit) bump(this.root, 'is-hit');
  }
}

class Pill {
  readonly root: HTMLElement;
  readonly icon: HTMLImageElement;
  private readonly value: HTMLElement;

  constructor(kind: string, icon: string, side: 'left' | 'right', row: 1 | 2) {
    this.value = el('span');
    this.icon = img(icon);
    this.root = el('div', `pill pill--${side} pill--row${row} pill--${kind}`, {}, [this.icon, this.value]);
  }

  set(text: string, bumpIt = false): void {
    this.value.textContent = text;
    if (bumpIt) bump(this.root, 'is-bump');
  }
}

function bump(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  // Force a reflow so the animation restarts on every call.
  void node.offsetWidth;
  node.classList.add(cls);
}

/** The original gameplay HUD: life bars on both edges and the level / arrows / souls / damage pills. */
export class Hud {
  readonly root: HTMLElement;
  readonly player = new LifeBar('player');
  readonly monster = new LifeBar('monster');
  readonly level = new Pill('level', 'iconLevel', 'left', 1);
  readonly arrows = new Pill('arrows', 'iconArrows', 'left', 2);
  readonly souls = new Pill('souls', 'soul', 'right', 1);
  readonly damage = new Pill('damage', 'iconDamage', 'right', 2);
  readonly hurt = el('div', 'hurt');
  private readonly toast = el('div', 'toast outline');
  private readonly mute: HTMLButtonElement;

  constructor(frame: HTMLElement, muted: boolean, onMute: (muted: boolean) => void) {
    this.mute = el('button', 'mute', { type: 'button', 'aria-label': 'Toggle sound' });
    let isMuted = muted;
    this.mute.innerHTML = isMuted ? SPEAKER_OFF : SPEAKER_ON;
    this.mute.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.mute.addEventListener('click', (e) => {
      e.stopPropagation();
      isMuted = !isMuted;
      this.mute.innerHTML = isMuted ? SPEAKER_OFF : SPEAKER_ON;
      onMute(isMuted);
    });
    this.root = el('div', 'hud', {}, [
      this.player.root,
      this.monster.root,
      this.level.root,
      this.arrows.root,
      this.souls.root,
      this.damage.root,
      this.toast,
      this.mute,
    ]);
    document.body.insertBefore(this.hurt, frame);
    frame.append(this.root);
  }

  setArrows(count: number, bumpIt = true): void {
    this.arrows.set(String(count), bumpIt);
    this.arrows.root.classList.toggle('is-low', count <= 3);
  }

  flashHurt(): void {
    this.hurt.classList.add('is-on');
    window.setTimeout(() => this.hurt.classList.remove('is-on'), 120);
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    bump(this.toast, 'is-on');
  }

  /** Centre of the souls icon in CSS pixels, where the souls fly to. */
  soulsTarget(): { x: number; y: number } {
    const r = this.souls.icon.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}

export { bump, img };
