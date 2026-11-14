/**
 * The Worker every published game runs on. It is fixed: publishing uploads this script, never the player's code. It
 * serves the game's static files, joins files that were split into parts to fit the 5 MiB per-file limit (with byte
 * range support, so films seek), and adds a small Report link to the game page.
 */
export const GAME_SERVER = String.raw`
const REPORT = '<a href="https://abuse.cloudflare.com/" target="_blank" rel="noopener" style="position:fixed;right:10px;bottom:6px;z-index:2147483647;font:11px/1.4 system-ui,sans-serif;color:#8a8f98;text-decoration:none;opacity:.75">Report this game</a>';
let parts;
async function partsMap(env, url) {
  if (parts) return parts;
  const r = await env.ASSETS.fetch(new URL('/_parts.json', url));
  parts = r.ok ? await r.json() : {};
  return parts;
}
function secure(response) {
  const r = new Response(response.body, response);
  r.headers.set('x-content-type-options', 'nosniff');
  r.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return r;
}
/** A file stored as numbered parts, served whole or by byte range. */
async function joined(request, env, url, entry) {
  const size = entry.size, part = entry.part, range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  let start = 0, end = size - 1;
  if (range) {
    if (range[1] === '' && range[2] !== '') start = Math.max(0, size - Number(range[2]));
    else { start = Number(range[1] || 0);if (range[2] !== '') end = Math.min(size - 1, Number(range[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size } });
  }
  const headers = { 'content-type': entry.type, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' };
  if (range) headers['content-range'] = 'bytes ' + start + '-' + end + '/' + size;
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const { readable, writable } = new TransformStream();
  (async () => {
    const writer = writable.getWriter();
    try {
      for (let i = Math.floor(start / part); i <= Math.floor(end / part); i++) {
        const r = await env.ASSETS.fetch(new URL(url.pathname + '.part' + i, url));
        if (!r.ok) throw new Error('missing part');
        const bytes = new Uint8Array(await r.arrayBuffer()), from = Math.max(0, start - i * part), to = Math.min(bytes.length, end - i * part + 1);
        await writer.write(bytes.subarray(from, to));
      }
      await writer.close();
    } catch (error) { await writer.abort(error); }
  })();
  return new Response(readable, { status: range ? 206 : 200, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    if (url.pathname === '/_parts.json' || /\.part\d+$/.test(url.pathname)) return new Response('Not found', { status: 404 });
    const entry = (await partsMap(env, url))[url.pathname];
    if (entry) return joined(request, env, url, entry);
    const response = await env.ASSETS.fetch(request);
    if ((response.headers.get('content-type') || '').includes('text/html') && typeof HTMLRewriter !== 'undefined')
      return secure(new HTMLRewriter().on('body', { element(body) { body.append(REPORT, { html: true }); } }).transform(response));
    return secure(response);
  },
};
`;
/** Files larger than this are stored as parts; a little under the 5 MiB limit. */
export const PART_BYTES = 4_718_592;
