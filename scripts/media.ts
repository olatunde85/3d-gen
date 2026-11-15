/**
 * Site videos live in a GitHub release, not in git, so re-rendering them never grows the repository.
 * `scripts/media.json` records which version of each video the site uses.
 *
 *   npm run media:fetch     downloads any missing video into public/media (the build runs this)
 *   npm run media:publish   uploads re-rendered videos to the release and records them in media.json
 *
 * Set ARA_SKIP_MEDIA=1 to build without the videos (the pages show their posters instead).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Entry { asset: string; sha256: string; size: number }
interface Manifest { repo: string; release: string; files: Record<string, Entry> }

const root = resolve(import.meta.dirname, '..'), manifestFile = join(root, 'scripts/media.json'), media = join(root, 'public/media');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const url = (asset: string) => `https://github.com/${manifest.repo}/releases/download/${manifest.release}/${asset}`;

async function fetchMedia() {
  if (process.env.ARA_SKIP_MEDIA) { console.log('media: skipped (ARA_SKIP_MEDIA)');return; }
  for (const [name, entry] of Object.entries(manifest.files)) {
    const file = join(media, name);
    if (existsSync(file)) {
      if (sha(readFileSync(file)) !== entry.sha256) console.warn(`media: ${name} differs from the published version; run npm run media:publish to publish it.`);
      continue;
    }
    console.log(`media: downloading ${name} (${(entry.size / 1e6).toFixed(1)} MB)`);
    const response = await fetch(url(entry.asset));
    if (!response.ok) throw Error(`media: could not download ${name} (${response.status}). Set ARA_SKIP_MEDIA=1 to build without videos.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha(bytes) !== entry.sha256) throw Error(`media: ${name} failed its checksum.`);
    writeFileSync(file, bytes);
  }
}

function publishMedia() {
  const gh = (...args: string[]) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try { gh('release', 'view', manifest.release, '--repo', manifest.repo); }
  catch { gh('release', 'create', manifest.release, '--repo', manifest.repo, '--prerelease', '--latest=false', '--title', 'Site media', '--notes', 'Videos for ara3dgen.com, downloaded by `npm run media:fetch`. Not a software release.'); }
  const work = mkdtempSync(join(tmpdir(), 'ara-media-'));
  try {
    for (const name of Object.keys(manifest.files)) {
      const file = join(media, name);
      if (!existsSync(file)) throw Error(`media: ${name} is missing from public/media.`);
      const bytes = readFileSync(file), hash = sha(bytes);
      if (hash === manifest.files[name].sha256) continue;
      // Each version gets its own asset name, so earlier builds keep working.
      const asset = name.replace(/(\.[^.]+)$/, `-${hash.slice(0, 8)}$1`), copy = join(work, asset);
      copyFileSync(file, copy);gh('release', 'upload', manifest.release, copy, '--repo', manifest.repo, '--clobber');
      manifest.files[name] = { asset, sha256: hash, size: bytes.length };
      console.log(`media: published ${name} as ${asset}`);
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

if (process.argv.includes('publish')) publishMedia();else await fetchMedia();
