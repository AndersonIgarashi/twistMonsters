import { CanvasTexture, Group, type Texture } from 'three';
import type { AdBridge } from '../ads/AdBridge';
import type { Audio } from '../audio/Audio';
import { CONFIG } from '../config';
import type { TextureName } from '../core/assets';
import type { Stage } from '../core/Stage';
import { Tweener, rand, randInt } from '../core/Tween';
import { DamageNumbers } from '../gfx/DamageNumbers';
import { ParticleLayer } from '../gfx/ParticleLayer';
import { EndCard } from '../ui/EndCard';
import { Hand } from '../ui/Hand';
import { Hud, el } from '../ui/Hud';
import { Attack } from './Attack';
import { Background } from './Background';
import { Bow } from './Bow';
import { Monster } from './Monster';
import { Souls } from './Souls';

type State = 'intro' | 'play' | 'dying' | 'end';

const IDLE_HINT = 3;

function dotTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Runs the playable: first tap shoots, one monster fight with its energy attack, the soul payout and the end card. */
export class Game {
  private state: State = 'intro';
  private readonly tween = new Tweener();
  private readonly world = new Group();
  private readonly bg: Background;
  private readonly monster: Monster;
  private readonly bow: Bow;
  private readonly attack: Attack;
  private readonly souls: Souls;
  private readonly blood: ParticleLayer;
  private readonly flash: ParticleLayer;
  private readonly numbers: DamageNumbers;
  private readonly hud: Hud;
  private readonly hand: Hand;
  private readonly hint: HTMLElement;
  private readonly end: EndCard;

  private monsterHp = 0;
  private playerHp = 0;
  private arrows = 0;
  private soulCount = 0;
  private soulsArrived = 0;
  private hits = 0;
  private playTime = 0;
  private idle = 0;
  private refillPending = false;
  private shake = 0;
  private time = 0;
  private readonly tmp = { x: 0, y: 0 };

  constructor(
    private readonly stage: Stage,
    tex: Record<TextureName, Texture>,
    private readonly audio: Audio,
    private readonly bridge: AdBridge,
    frame: HTMLElement,
  ) {
    stage.scene.add(this.world);
    this.bg = new Background(stage, tex);
    this.monster = new Monster(tex);
    this.world.add(this.monster.group, this.monster.eyeGroup);
    this.bow = new Bow(this.world, tex);
    this.attack = new Attack(this.world, tex, audio, { onFire: () => this.onLaser(), onTick: () => this.onLaserTick() });
    const dot = dotTexture();
    this.blood = new ParticleLayer(this.world, dot, 90, 21);
    this.flash = new ParticleLayer(this.world, tex.sparkle, 40, 22, { additive: true });
    this.numbers = new DamageNumbers(this.world, 26);
    this.souls = new Souls(this.world, tex, (i) => this.onSoul(i));

    this.hud = new Hud(frame, audio.muted, (muted) => audio.setMuted(muted));
    this.hint = el('div', 'hint outline', {}, ['TAP TO SHOOT!']);
    frame.append(this.hint);
    this.hand = new Hand(frame);
    this.end = new EndCard(frame, {
      onCta: () => this.openStore(),
      onReplay: () => {
        this.audio.play('button');
        this.reset();
      },
      onUpgrade: () => {
        this.audio.play('upgrade');
        this.hand.hide();
        this.tween.after(0.8, () => this.hand.pointAtElement(this.end.cta), this.end);
      },
    });

    stage.onResize(() => {
      if (this.state === 'intro' || (this.state === 'play' && this.hand.visible)) this.pointHandAtBow();
      else this.hand.reposition();
    });

    const down = (e: PointerEvent) => this.onDown(e);
    const up = () => this.onUp();
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.reset();
  }

  reset(): void {
    this.tween.clear();
    this.state = 'intro';
    this.monsterHp = CONFIG.monster.hp;
    this.playerHp = CONFIG.player.hp;
    this.arrows = CONFIG.player.arrows;
    this.soulCount = 0;
    this.soulsArrived = 0;
    this.hits = 0;
    this.playTime = 0;
    this.idle = 0;
    this.refillPending = false;
    this.shake = 0;
    this.monster.reset();
    this.bow.reset();
    this.attack.reset();
    this.souls.clear();
    this.blood.clear();
    this.flash.clear();
    this.numbers.clear();
    this.end.hide();
    this.hud.root.style.opacity = '1';
    this.hud.player.set(this.playerHp, CONFIG.player.hp);
    this.hud.monster.set(this.monsterHp, CONFIG.monster.hp);
    this.hud.level.set('1');
    this.hud.setArrows(this.arrows, false);
    this.hud.souls.set('0');
    this.hud.damage.set(`${CONFIG.player.dmgMax / 2}~${CONFIG.player.dmgMax}`);
    this.hand.hide();
    this.hint.classList.remove('is-visible');
    // The hand is up within a second of load and points at the one action there is.
    this.tween.after(0.5, () => {
      if (this.state !== 'intro') return;
      this.pointHandAtBow();
      this.hint.classList.add('is-visible');
    });
  }

  private pointHandAtBow(): void {
    const v = this.stage.view;
    this.stage.toScreen(0.32, CONFIG.bow.y + 0.12, this.tmp);
    this.hand.pointAt(this.tmp.x - v.frame.x, this.tmp.y - v.frame.y);
  }

  private onDown(e: PointerEvent): void {
    this.audio.unlock();
    if (this.state === 'end' || this.state === 'dying') return;
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    if (this.state === 'intro') this.state = 'play';
    this.idle = 0;
    this.hand.hide();
    this.hint.classList.remove('is-visible');
    if (this.bow.hasArrow) {
      this.bow.drawn = true;
      this.audio.play('draw', { volume: 0.55, minGap: 0.08 });
    }
  }

  private onUp(): void {
    if (this.state !== 'play' || !this.bow.drawn) return;
    if (!this.bow.fire()) {
      this.bow.drawn = false;
      return;
    }
    this.arrows--;
    this.hud.setArrows(this.arrows);
    this.audio.play('shoot', { volume: 0.9, rate: rand(0.95, 1.08) });
    if (this.arrows <= 0) this.bow.hasArrow = false;
  }

  private onHit(): void {
    const { y, radius } = CONFIG.monster;
    this.monster.stickAtBottom();
    const dmg = randInt(CONFIG.player.dmgMax / 2, CONFIG.player.dmgMax);
    this.monsterHp = Math.max(0, this.monsterHp - dmg);
    this.hud.monster.set(this.monsterHp, CONFIG.monster.hp, true);
    this.numbers.spawn(String(dmg), rand(-0.35, 0.35), y - radius - 0.7, 0, 0.66);
    this.audio.play('hit', { volume: 0.9, rate: rand(0.92, 1.1) });
    this.shake = Math.max(this.shake, 0.06);

    const hy = y - radius + 0.06;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + rand(-1.25, 1.25);
      const sp = rand(1.6, 4.4);
      const dark = rand(0.55, 1);
      this.blood.spawn(rand(-0.08, 0.08), hy, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.2, w: rand(0.07, 0.17), life: rand(0.45, 0.8),
        gravity: 9, drag: 1.5, r: 0.85 * dark, g: 0.04, b: 0.12 * dark, endScale: 0.4, fadeOut: 0.5,
      });
    }
    this.flash.spawn(0, hy, { w: 0.9, life: 0.22, rot: rand(0, 6.28), endScale: 1.4, a: 0.9, fadeOut: 0.2, pop: true });

    this.hits++;
    if (this.hits >= CONFIG.attack.afterHits) this.attack.start();
    if (this.monsterHp <= 0) this.win();
  }

  private onBreak(y: number): void {
    this.bow.shatter(0, y);
    this.audio.play('break', { volume: 0.95 });
    this.shake = Math.max(this.shake, 0.08);
    this.flash.spawn(0, y + 0.2, { w: 0.7, life: 0.18, rot: rand(0, 6.28), a: 0.8, fadeOut: 0.2, pop: true, r: 1, g: 0.85, b: 0.6 });
  }

  private onLaser(): void {
    this.shake = Math.max(this.shake, 0.16);
  }

  private onLaserTick(): void {
    if (this.state !== 'play') return;
    // The fight can always be won: the beam can never take the last point of life.
    this.playerHp = Math.max(1, this.playerHp - CONFIG.attack.tickDamage);
    this.hud.player.set(this.playerHp, CONFIG.player.hp, true);
    this.hud.flashHurt();
    this.numbers.spawn(`-${CONFIG.attack.tickDamage}`, rand(-0.9, 0.9), CONFIG.bow.y + rand(0.7, 1.2), 1, 0.56);
    this.shake = Math.max(this.shake, 0.14);
    this.audio.play('hit', { volume: 0.6, rate: 0.7 });
  }

  private refill(): void {
    this.refillPending = false;
    if (this.state !== 'play') return;
    this.arrows += CONFIG.player.refill;
    this.bow.hasArrow = true;
    this.hud.setArrows(this.arrows);
    this.hud.showToast(`+${CONFIG.player.refill} ARROWS`);
    this.audio.play('upgrade');
  }

  private win(): void {
    this.state = 'dying';
    this.attack.cancel();
    this.monster.die();
    this.bow.drawn = false;
    this.hand.hide();
    this.hint.classList.remove('is-visible');
    this.audio.play('dying');
    const { x, y } = CONFIG.monster;
    this.monster.forEachArrow((ax, ay, out) => this.bow.launchLoose(ax, ay, out));
    this.monster.clearArrows();
    for (let i = 0; i < 10; i++) {
      this.flash.spawn(x + rand(-0.9, 0.9), y + rand(-0.9, 0.9), { w: rand(0.5, 1), life: rand(0.25, 0.5), rot: rand(0, 6.28), a: 0.9, pop: true, fadeOut: 0.3 });
    }
    this.tween.after(0.55, () => {
      const t = this.hud.soulsTarget();
      this.stage.toWorld(t.x, t.y, this.tmp);
      this.souls.setTarget(this.tmp.x, this.tmp.y);
      this.souls.burst(x, y, CONFIG.monster.souls);
    });
    this.tween.after(CONFIG.monster.deathTime, () => {
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(2, 5);
        this.flash.spawn(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: rand(0.35, 0.75), life: rand(0.35, 0.6), drag: 3, rot: rand(0, 6.28), spin: rand(-6, 6), fadeOut: 0.3, r: 0.75, g: 0.6, b: 1 });
      }
      this.flash.spawn(x, y, { w: 3.2, life: 0.35, a: 0.9, pop: true, fadeOut: 0.25, r: 0.8, g: 0.7, b: 1 });
    });
  }

  private onSoul(i: number): void {
    this.soulCount += CONFIG.monster.soulValue;
    this.soulsArrived++;
    this.hud.souls.set(String(this.soulCount), true);
    this.audio.play('soul', { volume: 0.7, rate: 1 + i * 0.045, minGap: 0.02 });
    if (this.soulsArrived === CONFIG.monster.souls) this.tween.after(0.55, () => this.showEnd());
  }

  private showEnd(): void {
    this.state = 'end';
    this.audio.play('win');
    this.hud.root.style.opacity = '0';
    this.end.show(this.soulCount);
    this.tween.after(1.2, () => {
      if (this.state === 'end' && !this.end.pickedUpgrade) this.hand.pointAtElement(this.end.cards[0]);
    }, this.end);
  }

  private openStore(): void {
    this.audio.play('button');
    if (!this.bridge.openStore(CONFIG.storeUrl)) this.end.showNote('In the live ad this opens the store');
  }

  update(dt: number): void {
    this.time += dt;
    this.tween.update(dt);
    if (this.state === 'play') {
      this.playTime += dt;
      this.idle += dt;
      if (this.playTime >= CONFIG.attack.afterSeconds) this.attack.start();
      if (this.idle > IDLE_HINT && !this.hand.visible && this.monster.alive) this.pointHandAtBow();
    }

    this.bg.update(this.time);
    this.monster.update(dt);
    this.attack.update(dt);
    this.bow.update(dt);
    this.collide();

    if (this.state === 'play' && this.arrows <= 0 && !this.refillPending && this.monster.alive && !this.bow.inFlight) {
      this.refillPending = true;
      this.audio.play('fail', { volume: 0.6 });
      this.tween.after(0.55, () => this.refill());
    }

    this.blood.update(dt);
    this.flash.update(dt);
    this.numbers.update(dt);
    this.souls.update(dt);

    this.shake = Math.max(0, this.shake - dt * (this.attack.firing ? 0.05 : 0.5));
    if (this.attack.firing) this.shake = Math.max(this.shake, 0.07);
    this.stage.shakeX = this.shake > 0.001 ? rand(-1, 1) * this.shake : 0;
    this.stage.shakeY = this.shake > 0.001 ? rand(-1, 1) * this.shake : 0;
    this.stage.applyCamera();
  }

  private collide(): void {
    const { y, radius, embed } = CONFIG.monster;
    const { h, gap } = CONFIG.arrow;
    const tails = y - (radius - embed + h);
    const contact = y - (radius - embed);
    for (const f of this.bow.flying) {
      if (!f.active || !this.monster.alive) continue;
      const tip = f.y + h / 2;
      if (!f.passedTails && tip >= tails) {
        f.passedTails = true;
        if (this.monster.blockedAtBottom(gap)) {
          f.active = false;
          this.onBreak(tails);
          continue;
        }
      }
      if (tip >= contact) {
        f.active = false;
        if (this.monster.blockedAtBottom(gap)) this.onBreak(tails);
        else this.onHit();
      }
    }
  }
}
