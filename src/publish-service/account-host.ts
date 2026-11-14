/**
 * The one publishing step that cannot run inside a Cloudflare Worker: Cloudflare refuses to create temporary accounts
 * for requests coming from Workers ("worker_subrequest_blocked"). This entry serves only POST /v1/account, from any
 * platform with standard Request and Response (a Vercel function here), using the same service code: the same 18+ check
 * and the same sealed session, so the Worker can carry on with the upload once the account exists. Both hosts must
 * share SESSION_SECRET.
 */
import service, { type Env } from './index';

const WINDOW = 60_000, LIMIT = 3, recent = new Map<string, number[]>();
/** A small in-memory limit per visitor and instance, as the Worker's rate-limit binding is not available here. */
function allowed(visitor: string, now = Date.now()) {
  const times = (recent.get(visitor) ?? []).filter((t) => now - t < WINDOW);
  if (recent.size > 5000) recent.clear();
  if (times.length >= LIMIT) { recent.set(visitor, times);return false; }
  times.push(now);recent.set(visitor, times);return true;
}
export function accountHost(env: Env) {
  return async (request: Request, visitor: string): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path !== '/v1/account') return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    if (request.method === 'POST' && !allowed(visitor)) {
      const origin = request.headers.get('origin') ?? '';
      return new Response(JSON.stringify({ error: 'You are publishing very quickly. Please wait a minute and try again.' }), { status: 429, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, vary: 'origin' } });
    }
    return service.fetch(request, env);
  };
}
