import { LinearFilter, LinearMipmapLinearFilter, type Texture, TextureLoader } from 'three';

const imageUrls = import.meta.glob<string>('../assets/images/*.webp', { eager: true, query: '?url', import: 'default' });
const soundUrls = import.meta.glob<string>('../assets/sounds/*.mp3', { eager: true, query: '?url', import: 'default' });

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));

export const images: Record<string, string> = {};
for (const [path, url] of Object.entries(imageUrls)) images[baseName(path)] = url;

export const sounds = new Map<string, string>();
for (const [path, url] of Object.entries(soundUrls)) sounds.set(baseName(path), url);

/** Textures that get sampled below their size (arrows, souls) get mipmaps; the nebula is always magnified and sheets don't, so frames never bleed. */
const MIPMAPPED = new Set(['arrow', 'arrowBroken1', 'arrowBroken2', 'soul']);

export const GAME_TEXTURES = [
  'bg', 'darkTop', 'darkBottom', 'spikeball', 'tentacle', 'eye', 'eyeWhite', 'body', 'energyBall', 'laser', 'bolt',
  'bowIdle', 'bowDrawn', 'arrow', 'arrowBroken1', 'arrowBroken2', 'soulGlow', 'sparkle', 'soul',
] as const;
export type TextureName = (typeof GAME_TEXTURES)[number];

export async function loadTextures(): Promise<Record<TextureName, Texture>> {
  const loader = new TextureLoader();
  const entries = await Promise.all(
    GAME_TEXTURES.map(async (name) => {
      const tex = await loader.loadAsync(images[name]);
      const mip = MIPMAPPED.has(name);
      tex.generateMipmaps = mip;
      tex.minFilter = mip ? LinearMipmapLinearFilter : LinearFilter;
      tex.magFilter = LinearFilter;
      return [name, tex] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<TextureName, Texture>;
}
