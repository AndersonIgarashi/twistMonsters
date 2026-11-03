// One-off asset pipeline: turns the original Unity project's PNG and MP3 files
// into the small WebP sprite sheets and mono MP3s the playable inlines.
// Usage: TM_SRC="<Unity project>/Assets" node tools/buildAssets.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = process.env.TM_SRC ?? 'C:/Users/User/Desktop/PortifaDev/TwistMonstersIO/TwistMonsters/Assets';
const IMG = 'src/assets/images';
const SND = 'src/assets/sounds';
mkdirSync(IMG, { recursive: true });
mkdirSync(SND, { recursive: true });

const sprite = (file) => join(SRC, 'Sprites', file);
const report = [];

async function single(name, file, { scale = 1, quality = 82, lossless = false } = {}) {
  const meta = await sharp(sprite(file)).metadata();
  const out = join(IMG, `${name}.webp`);
  await sharp(sprite(file))
    .resize(Math.round(meta.width * scale), Math.round(meta.height * scale))
    .webp({ quality, alphaQuality: 90, effort: 6, lossless })
    .toFile(out);
  report.push([out, statSync(out).size]);
}

// Re-packs a horizontal strip into a grid so no sheet exceeds 2048 px
// (low-end mobile GPUs cap textures at 4096 and many strips were 5000 px wide).
async function sheet(name, file, frameW, frameH, count, { scale = 1, cols, quality = 82 } = {}) {
  const fw = Math.round(frameW * scale);
  const fh = Math.round(frameH * scale);
  const c = cols ?? count;
  const rows = Math.ceil(count / c);
  const src = sharp(sprite(file));
  const composites = [];
  for (let i = 0; i < count; i++) {
    const frame = await src
      .clone()
      .extract({ left: i * frameW, top: 0, width: frameW, height: frameH })
      .resize(fw, fh)
      .png()
      .toBuffer();
    composites.push({ input: frame, left: (i % c) * fw, top: Math.floor(i / c) * fh });
  }
  const out = join(IMG, `${name}.webp`);
  await sharp({ create: { width: c * fw, height: rows * fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ quality, alphaQuality: 90, effort: 6 })
    .toFile(out);
  report.push([out, statSync(out).size, `${c}x${rows} frames of ${fw}x${fh}`]);
}

// The darkness frame is a full-screen PNG whose middle is fully transparent.
// Ship only the opaque top and bottom bands so the GPU never blends the empty middle.
async function darkness() {
  const file = sprite('novos/DarknessBack.png');
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const rowHas = (y) => {
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 8) return true;
    return false;
  };
  let top = 0;
  while (top < info.height && rowHas(top)) top++;
  let bottom = info.height - 1;
  while (bottom > 0 && rowHas(bottom)) bottom--;
  const scale = 0.5;
  const bands = [
    ['darkTop', 0, top],
    ['darkBottom', bottom + 1, info.height - bottom - 1],
  ];
  for (const [name, y, h] of bands) {
    const out = join(IMG, `${name}.webp`);
    await sharp(file)
      .extract({ left: 0, top: y, width: info.width, height: h })
      .resize(Math.round(info.width * scale), Math.round(h * scale))
      .webp({ quality: 80, alphaQuality: 85, effort: 6 })
      .toFile(out);
    report.push([out, statSync(out).size, `band y=${y} h=${h} of ${info.height}`]);
  }
}

function sound(name, file, { trim, fade } = {}) {
  const out = join(SND, `${name}.mp3`);
  const filters = ['silenceremove=start_periods=1:start_threshold=-50dB'];
  if (fade) filters.push(`afade=t=out:st=${fade[0]}:d=${fade[1]}`);
  const args = ['-y', '-v', 'error', '-i', join(SRC, 'Sounds', file), '-af', filters.join(',')];
  if (trim) args.push('-t', String(trim));
  args.push('-ac', '1', '-ar', '44100', '-b:a', '56k', out);
  execFileSync('ffmpeg', args);
  report.push([out, statSync(out).size]);
}

await single('bg', 'novos/Background.png', { scale: 0.55, quality: 68 });
await darkness();
await sheet('spikeball', 'novos/SpriteFruit.png', 298, 300, 9, { scale: 0.5, cols: 3 });
await sheet('tentacle', 'novos/spriteTentaculo.png', 254, 215, 7, { cols: 4 });
await sheet('eye', 'novos/SpriteOlhoMonstro.png', 185, 183, 7, { cols: 4 });
await sheet('laser', 'monsters/spriteVFXlaser222.png', 167, 342, 29, { scale: 0.75, cols: 6 });
await sheet('bolt', 'monsters/trovaoEffect.png', 166, 272, 11, { scale: 0.75, cols: 4 });
await single('eyeWhite', 'novos/eyeWhite.png');
await single('body', 'novos/newMonsterBase.png');
await single('energyBall', 'monsters/energyBall.png');
await single('bowIdle', 'Arch.png', { quality: 85 });
await single('bowDrawn', 'ArchReadyToShoot.png', { quality: 85 });
await single('arrow', 'novos/flecha2.png', { scale: 0.5, quality: 85 });
await single('arrowBroken1', 'playerWeapons/flechaQuebrada1.png', { scale: 0.5 });
await single('arrowBroken2', 'playerWeapons/flechaQuebrada2.png', { scale: 0.5 });
await single('soulGlow', 'UIGameplay/SoulSpawn.png', { scale: 0.75 });
await single('sparkle', 'UIGameplay/LightEffect.png');
await single('soul', 'UIGameplay/miniIconSoul.png', { quality: 88 });
await single('iconHeart', 'UIGameplay/iconLifePlayer.png', { quality: 88 });
await single('iconMonster', 'UIGameplay/iconLifeMonster.png', { quality: 88 });
await single('iconArrows', 'UIGameplay/miniIconArrows.png', { quality: 88 });
await single('iconDamage', 'UIGameplay/miniIconDamage.png', { quality: 88 });
await single('iconLevel', 'UIGameplay/miniIconLevel.png', { quality: 88 });
await single('logo', 'logotipo.png', { scale: 0.6, quality: 86 });
await single('victory', 'win/VictoryPanelNEW.png', { scale: 0.6, quality: 82 });
await single('rays', 'gameoverUI/lightEffect.png', { scale: 0.5, quality: 72 });
await single('upgradeCard', 'Upgrades/backUpgrade.png', { quality: 85 });
await single('upHeart', 'Upgrades/hearth.png', { quality: 88 });
await single('upArrows', 'Upgrades/arrow.png', { quality: 88 });
await single('upDamage', 'Upgrades/damage.png', { quality: 88 });

sound('shoot', 'arrow.mp3');
sound('draw', 'rope1.mp3');
sound('hit', 'monsterHit.mp3');
sound('break', 'breakingWood1.mp3');
sound('zap1', 'eletrecidade1.mp3', { trim: 1.2, fade: [0.9, 0.3] });
sound('zap2', 'eletrecidade2.mp3');
sound('zap3', 'eletrecidade3.mp3');
sound('charge', 'monsterAttackSoundFinal.mp3', { trim: 5.2, fade: [4.4, 0.8] });
sound('dying', 'monsterDying.mp3');
sound('soul', 'soulEffect.mp3');
sound('win', 'winSound.mp3');
sound('upgrade', 'upgradeSound.mp3');
sound('button', 'but_Sound.mp3');
sound('fail', 'incorrectSound.mp3');

let total = 0;
for (const [file, size, note] of report) {
  total += size;
  console.log(`${String(size).padStart(7)}  ${file}${note ? `  (${note})` : ''}`);
}
console.log(`${String(total).padStart(7)}  total`);
