const params = new URLSearchParams(location.search);

/**
 * Tuning for the playable. Positions, speeds and animation rates come from the original
 * Unity scene (100 px per unit, orthographic size 5); the fight is tuned so one monster
 * falls in roughly ten arrows instead of the full game's fourteen.
 */
export const CONFIG = {
  storeUrl: 'https://play.google.com/store/apps/details?id=com.worgusgames.twistmonsters',
  cta: params.get('cta') ?? 'PLAY NOW',
  startMuted: params.get('sound') === '0',
  dev: params.get('dev') === '1',
  maxDpr: Math.max(1, Math.min(3, Number(params.get('dpr')) || 2)),

  monster: {
    x: 0,
    y: 0.95,
    hp: 120,
    /** Degrees per second, counter-clockwise (the original's speedRot). */
    spin: 80,
    /** Body radius in units (newMonsterBase.png at 0.64 scale). */
    radius: 1.07,
    /** How deep an arrow tip sinks into the body. */
    embed: 0.28,
    deathTime: 1.7,
    souls: 10,
    soulValue: 10,
  },

  player: {
    hp: 100,
    arrows: 14,
    dmgMax: 20,
    /** Arrows refilled when the quiver runs dry, so the fight can always be won. */
    refill: 5,
  },

  arrow: {
    speed: 25,
    /** Rendered size of flecha2.png in units (sprite 1.31 x 8.11 at scale 0.22 x 0.158). */
    w: 0.288,
    h: 1.28,
    restY: -3.3,
    cooldown: 0.16,
    /** Two arrows closer than this (degrees, measured around the monster) collide. */
    gap: 6.5,
  },

  bow: { y: -3.86, w: 2.9 },

  attack: {
    /** The monster charges after this many hits, or this many seconds into the fight. */
    afterHits: 1,
    afterSeconds: 4,
    charge: 1.9,
    hold: 0.35,
    ticks: 4,
    tickEvery: 0.3,
    tickDamage: 15,
  },
} as const;
