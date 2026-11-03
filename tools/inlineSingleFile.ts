import type { Plugin } from 'vite';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Inlines the entry JS chunk and the CSS bundle into index.html.
 *
 * Ad networks (Meta, Google, AppLovin, Unity Ads, ironSource, Mintegral...)
 * expect a playable as a single HTML file without external requests, so the
 * production build emits exactly that — no extra dependency required.
 */
export function inlineSingleFile(): Plugin {
  return {
    name: 'inline-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const htmlFile of Object.values(bundle)) {
        if (htmlFile.type !== 'asset' || !htmlFile.fileName.endsWith('.html')) continue;

        let html = String(htmlFile.source);

        for (const [fileName, file] of Object.entries(bundle)) {
          const name = escapeRegExp(fileName);

          if (file.type === 'chunk' && file.isEntry) {
            const tag = new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`);
            // A literal "</script" inside the bundle would terminate the inline tag early.
            const code = file.code.replace(/<\/script/gi, '<\\/script');
            html = html.replace(tag, () => `<script type="module">${code}</script>`);
            delete bundle[fileName];
          } else if (file.type === 'asset' && fileName.endsWith('.css')) {
            const tag = new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`);
            html = html.replace(tag, () => `<style>${String(file.source)}</style>`);
            delete bundle[fileName];
          }
        }

        htmlFile.source = html;
      }
    },
  };
}
