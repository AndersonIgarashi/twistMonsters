import { CONFIG } from '../config';
import { bump, el, img } from './Hud';

interface Upgrade {
  id: 'life' | 'arrows' | 'damage';
  title: string;
  icon: string;
  bonus: string;
  from: number;
  to: number;
}

/** Level 2 of each upgrade in the original bdUpgrades table: every one costs 100 souls. */
const UPGRADES: readonly Upgrade[] = [
  { id: 'life', title: 'LIFE', icon: 'upHeart', bonus: '+20', from: CONFIG.player.hp, to: CONFIG.player.hp + 20 },
  { id: 'arrows', title: 'ARROWS', icon: 'upArrows', bonus: '+1', from: CONFIG.player.arrows, to: CONFIG.player.arrows + 1 },
  { id: 'damage', title: 'DAMAGE', icon: 'upDamage', bonus: '+2', from: CONFIG.player.dmgMax, to: CONFIG.player.dmgMax + 2 },
];
const COST = 100;

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9"/></svg>';

export interface EndCardHooks {
  onCta: () => void;
  onReplay: () => void;
  onUpgrade: (id: Upgrade['id']) => void;
}

/**
 * Victory end card. The souls just won buy exactly one level-2 upgrade; once it is
 * picked, the other two lock and the only way to keep going is the store.
 */
export class EndCard {
  readonly root: HTMLElement;
  readonly dim = el('div', 'end-dim');
  readonly cta: HTMLButtonElement;
  readonly cards: HTMLButtonElement[] = [];
  private readonly soulsText = el('b');
  private readonly ask = el('div', 'end__ask outline', {}, ['Spend your souls on an upgrade!']);
  private readonly note = el('div', 'end__note outline');
  private bought = false;

  constructor(frame: HTMLElement, private readonly hooks: EndCardHooks) {
    this.cta = el('button', 'end__cta', { type: 'button' }, [el('span', 'outline', {}, [CONFIG.cta])]);
    this.cta.addEventListener('click', () => this.hooks.onCta());

    const cardRow = el('div', 'cards');
    for (const up of UPGRADES) {
      const card = el('button', 'card', { type: 'button', 'aria-label': `${up.title} upgrade` }, [
        img('upgradeCard', 'card__bg'),
        el('div', 'card__title outline', {}, [up.title]),
        img(up.icon, 'card__icon'),
        el('div', 'card__bonus outline', {}, [up.bonus]),
        el('div', 'card__from outline', {}, [String(up.from)]),
        el('div', 'card__to outline', {}, [String(up.to)]),
        el('div', 'card__level outline', {}, ['Level 2']),
        el('div', 'card__lock outline', {}, ['Need more souls']),
        el('div', 'card__cost outline', {}, [String(COST)]),
        el('div', 'card__check'),
      ]);
      (card.lastElementChild as HTMLElement).innerHTML = CHECK;
      card.addEventListener('click', () => this.pick(card, up));
      this.cards.push(card);
      cardRow.append(card);
    }

    const panel = el('div', 'end__panel', {}, [
      img('victory'),
      el('div', 'end__stats outline', {}, [
        el('span', '', {}, ['Level ', el('b', '', {}, ['1']), ' cleared']),
        el('span', 'end__souls', {}, [img('soul'), this.soulsText]),
      ]),
      this.ask,
      cardRow,
    ]);

    const replay = el('button', 'end__replay', { type: 'button' }, ['↻ Replay']);
    replay.addEventListener('click', () => this.hooks.onReplay());

    this.root = el('div', 'end', {}, [
      el('div', 'end__rays', {}, [img('rays')]),
      img('logo', 'end__logo'),
      panel,
      this.cta,
      el('div', 'end__teaser outline', {}, ['', el('b', '', {}, ['49 monsters']), ' left to twist']),
      this.note,
      replay,
    ]);
    frame.append(this.root);
    document.body.insertBefore(this.dim, frame);
  }

  get pickedUpgrade(): boolean {
    return this.bought;
  }

  show(souls: number): void {
    this.bought = false;
    this.soulsText.textContent = String(souls);
    this.ask.textContent = 'Spend your souls on an upgrade!';
    for (const c of this.cards) c.classList.remove('is-bought', 'is-bought-b', 'is-locked');
    this.cta.classList.remove('is-pulsing');
    this.dim.classList.add('is-visible');
    this.root.classList.add('is-visible');
    window.setTimeout(() => this.cta.classList.add('is-pulsing'), 900);
  }

  hide(): void {
    this.cta.classList.remove('is-pulsing');
    this.dim.classList.remove('is-visible');
    this.root.classList.remove('is-visible');
    this.note.classList.remove('is-on');
  }

  /** Shown in the portfolio build, where the CTA does not leave the page. */
  showNote(text: string): void {
    this.note.textContent = text;
    this.note.classList.add('is-on');
    window.setTimeout(() => this.note.classList.remove('is-on'), 2200);
  }

  private pick(card: HTMLButtonElement, up: Upgrade): void {
    if (this.bought) {
      // Locked cards are a store moment: more souls live in the full game.
      if (card.classList.contains('is-locked')) this.hooks.onCta();
      return;
    }
    this.bought = true;
    bump(card, 'is-bought');
    for (const c of this.cards) if (c !== card) c.classList.add('is-locked');
    this.soulsText.textContent = '0';
    this.ask.textContent = `${up.title} upgraded! Beat Level 2 for more souls`;
    this.hooks.onUpgrade(up.id);
  }
}
