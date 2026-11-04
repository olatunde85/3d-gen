/** Ship the video dependency's licence and exact, unmodified source with every static build. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';
import type { Plugin } from 'vite';

export function studioLicenses(): Plugin {
  return {
    name: 'studio-video-notices',
    apply: 'build',
    generateBundle() {
      const root = resolve(import.meta.dirname, '../node_modules/mediabunny');
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const files: Record<string, Uint8Array> = {};
      const collect = (relative: string) => {
        for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const path = `${relative}/${entry.name}`;
          if (entry.isDirectory()) collect(path);
          else if (entry.isFile()) files[`mediabunny-${pkg.version}/${path}`] = readFileSync(join(root, path));
        }
      };
      collect('src');
      for (const name of ['LICENSE', 'README.md', 'package.json']) files[`mediabunny-${pkg.version}/${name}`] = readFileSync(join(root, name));
      const emit = (name: string, source: string | Uint8Array) => this.emitFile({ type: 'asset', fileName: `third-party/mediabunny/${name}`, source });
      emit('LICENSE.txt', readFileSync(join(root, 'LICENSE')));
      emit('source.zip', zipSync(files, { level: 9, mtime: new Date('1980-01-01T00:00:00Z') }));
      emit('NOTICE.txt', `Mediabunny ${pkg.version}\nCopyright (c) 2026-present, Vanilagy and contributors\nLicence: ${pkg.license}\n\nAra Studio uses the unmodified Mediabunny library for MP4 encoding and muxing.\nThe exact original source used by this build is available in source.zip in this directory.\nIts licence is included in LICENSE.txt and in the source archive.\n\nUpstream: https://github.com/Vanilagy/mediabunny\nPackage: https://www.npmjs.com/package/mediabunny/v/${pkg.version}\n`);
      // LLM Assist's optional in-app generation uses the Anthropic SDK (Apache-2.0).
      const sdk = resolve(import.meta.dirname, '../node_modules/@anthropic-ai/sdk'), sdkVersion = JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8')).version;
      this.emitFile({ type: 'asset', fileName: 'third-party/anthropic-sdk/LICENSE.txt', source: `Anthropic TypeScript SDK ${sdkVersion} (@anthropic-ai/sdk), used unmodified.\n\n${readFileSync(join(sdk, 'LICENSE'), 'utf8')}\n\n${readFileSync(join(sdk, 'LICENSE-MIT'), 'utf8')}` });
    },
  };
}
