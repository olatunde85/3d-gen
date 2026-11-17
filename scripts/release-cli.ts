/**
 * Prepares the ara3d package (CLI and browser library) and the ara3d-data package for npm.
 *   npm run release-cli              packs public/assets, uploads it to the cli-data release if it changed, builds the CLI
 *   npm run release-cli -- --publish --otp 123456   also publishes to npm (npm login first; the code is from your authenticator app)
 * The data zip is deterministic, so unchanged assets keep the same file and nothing is uploaded. The library loads the
 * same files from the ara3d-data npm package through jsDelivr; when they change, raise packages/data/package.json's
 * version and it is published first.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const root = resolve(import.meta.dirname, '..'), assets = join(root, 'public/assets'), cli = join(root, 'packages/cli');
const versionFile = join(cli, 'src/data-version.json'), DATA = JSON.parse(readFileSync(versionFile, 'utf8'));
// Interface thumbnails are only used by the website, and the web copy (public/assets/web) only by the library.
const SKIP = new Set(['thumbs', 'web']);
execFileSync('npx', ['tsx', join(root, 'scripts/build-web-assets.ts')], { cwd: root, stdio: 'inherit' });

function files(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (dir === assets && SKIP.has(name)) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const entries: Zippable = {};
for (const file of files(assets)) entries[relative(assets, file).split(sep).join('/')] = [readFileSync(file), { mtime: new Date('2026-01-01T00:00:00Z'), level: 6 }];
const zip = zipSync(entries), sha = createHash('sha256').update(zip).digest('hex');
console.log(`data: ${Object.keys(entries).length} files, ${(zip.length / 1e6).toFixed(1)} MB`);

if (sha !== DATA.sha256) {
  const gh = (...args: string[]) => execFileSync('gh', [...args, '--repo', DATA.repo], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try { gh('release', 'view', DATA.release); }
  catch { gh('release', 'create', DATA.release, '--prerelease', '--latest=false', '--title', 'ara3d CLI data', '--notes', 'Character data downloaded by the ara3d command-line tool on first run. Not a software release.'); }
  const asset = `ara3d-data-${sha.slice(0, 12)}.zip`, out = join(root, 'out/cli');
  mkdirSync(out, { recursive: true });writeFileSync(join(out, asset), zip);
  gh('release', 'upload', DATA.release, join(out, asset), '--clobber');
  writeFileSync(versionFile, JSON.stringify({ ...DATA, asset, sha256: sha, size: zip.length }, null, 2) + '\n');
  console.log(`data: uploaded ${asset}; commit packages/cli/src/data-version.json`);
} else console.log('data: unchanged');

// The ara3d-data package: the same files, served to the library by jsDelivr. It records which data it holds, so a
// change is never published under a version that already exists.
const dataPackage = join(root, 'packages/data'), dataManifest = JSON.parse(readFileSync(join(dataPackage, 'package.json'), 'utf8'));
const hashFile = join(dataPackage, 'data-hash.json'), published = JSON.parse(readFileSync(hashFile, 'utf8'));
rmSync(join(dataPackage, 'assets'), { recursive: true, force: true });
cpSync(assets, join(dataPackage, 'assets'), { recursive: true, filter: (src) => !src.startsWith(join(assets, 'thumbs')) });
// The package holds the web copy too, so its hash covers both.
const webHash = createHash('sha256').update(sha);
for (const file of files(join(assets, 'web'))) webHash.update(relative(assets, file)).update(readFileSync(file));
const dataSha = webHash.digest('hex'), dataChanged = published.sha256 !== dataSha;
if (dataChanged && published.version === dataManifest.version) throw Error(`The character data changed: raise the version in packages/data/package.json (now ${dataManifest.version}).`);
console.log(`ara3d-data ${dataManifest.version}: ${dataChanged ? 'new data, to publish' : 'unchanged'}`);

for (const config of ['vite.config.ts', 'vite.lib.config.ts', 'vite.embed.config.ts']) execFileSync('npx', ['vite', 'build', '--config', join(cli, config)], { cwd: root, stdio: 'inherit' });
execFileSync('npx', ['tsc', '-p', join(cli, 'tsconfig.types.json')], { cwd: root, stdio: 'inherit' });
// npm requires two-factor authentication to publish: pass the current code from your authenticator app with --otp.
const otp = process.argv[process.argv.indexOf('--otp') + 1], publish = (cwd: string) => execFileSync('npm', ['publish', '--access', 'public', ...(process.argv.includes('--otp') && otp ? [`--otp=${otp}`] : [])], { cwd, stdio: 'inherit' });
if (process.argv.includes('--publish')) {
  if (dataChanged) { publish(dataPackage);writeFileSync(hashFile, JSON.stringify({ version: dataManifest.version, sha256: dataSha }, null, 2) + '\n');console.log('Published ara3d-data; commit packages/data/data-hash.json'); }
  publish(cli);
  // jsDelivr caches what "ara3d@0" means for up to 12 hours. Once npm shows the new version (it takes a minute or two),
  // ask jsDelivr to look again, so pages using @0 get this release.
  const version = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')).version;
  for (let i = 0; i < 36; i++) {
    const shown = (() => { try { return execFileSync('npm', ['view', 'ara3d', 'version'], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
    if (shown === version) break;
    if (i === 0) console.log(`Waiting for npm to show ara3d ${version}…`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  for (const file of ['dist/embed.js', 'dist/index.js']) {
    const response = await fetch(`https://purge.jsdelivr.net/npm/ara3d@0/${file}`).catch(() => undefined);
    console.log(response?.ok ? `jsDelivr refreshed ara3d@0/${file}` : `Could not refresh ara3d@0/${file} on jsDelivr; it updates within 12 hours anyway.`);
  }
}
else console.log('Ready. Publish with: npm run release-cli -- --publish');
