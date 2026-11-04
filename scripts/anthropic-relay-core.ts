/**
 * A minimal relay for LLM Assist's "Generate here". Some Anthropic organisations block API calls made
 * directly from web pages; the relay makes the same call server-side with the user's own key, so it
 * works for every key. It forwards only Claude message and model requests, and stores nothing.
 * Web-standard only, so the Vite server and the Cloudflare Pages Function share it.
 */
export const RELAY_PATH = '/anthropic-relay';
const ALLOWED = /^\/v1\/(messages|models(\/[\w.-]+)?)$/;
const FORWARD = ['x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type', 'accept'];

/** Web-standard handler, shared by the Vite server and the Cloudflare Pages Function. */
export async function relay(request: Request, path: string): Promise<Response> {
  if (path === '/ping') return Response.json({ ok: true, relay: 'anthropic' });
  if (!ALLOWED.test(path) || !['GET', 'POST'].includes(request.method)) return Response.json({ type: 'error', error: { type: 'not_found_error', message: 'The relay only forwards Claude message and model requests.' } }, { status: 404 });
  const headers = new Headers();
  // Origin, cookies and the browser-access header stay behind: Anthropic sees an ordinary server request.
  for (const name of FORWARD) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  // The SDK sends the key as a bearer token to custom base URLs; Anthropic expects API keys in x-api-key.
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (bearer && !headers.has('x-api-key')) headers.set(bearer.startsWith('sk-ant-api') ? 'x-api-key' : 'authorization', bearer.startsWith('sk-ant-api') ? bearer : `Bearer ${bearer}`);
  const upstream = await fetch(`https://api.anthropic.com${path}${new URL(request.url).search}`, {
    method: request.method, headers, body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
  });
  const out = new Headers();
  for (const name of ['content-type', 'request-id', 'retry-after', 'x-should-retry']) { const value = upstream.headers.get(name); if (value) out.set(name, value); }
  out.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

