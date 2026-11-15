/**
 * Prepares the ara3d CLI for npm.
 *   npm run release-cli              packs public/assets, uploads it to the cli-data release if it changed, builds the CLI
 *   npm run release-cli -- --publish --otp 123456   also publishes to npm (npm login first; the code is from your authenticator app)
 * The data zip is deterministic, so unchanged assets keep the same file and nothing is uploaded.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const root = resolve(import.meta.dirname, '..'), assets = join(root, 'public/assets'), cli = join(root, 'packages/cli');
const versionFile = join(cli, 'src/data-version.json'), DATA = JSON.parse(readFileSync(versionFile, 'utf8'));
// Interface thumbnails are only used by the website.
const SKIP = new Set(['thumbs']);

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

execFileSync('npx', ['vite', 'build', '--config', join(cli, 'vite.config.ts')], { cwd: root, stdio: 'inherit' });
// npm requires two-factor authentication to publish: pass the current code from your authenticator app with --otp.
const otp = process.argv[process.argv.indexOf('--otp') + 1];
if (process.argv.includes('--publish')) execFileSync('npm', ['publish', '--access', 'public', ...(process.argv.includes('--otp') && otp ? [`--otp=${otp}`] : [])], { cwd: cli, stdio: 'inherit' });
else console.log('Ready. Publish with: npm run release-cli -- --publish');
