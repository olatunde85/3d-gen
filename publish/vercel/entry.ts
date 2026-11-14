/**
 * Vercel entry for the account step (a Node function on AWS, outside Cloudflare); bundled to api/account.js by
 * `npm run publish:build-account`. vercel.json routes /v1/account here.
 */
import { accountHost } from '../../src/publish-service/account-host';
declare const process: { env: Record<string, string | undefined> };
let handler: ReturnType<typeof accountHost> | undefined;
async function handle(request: Request) {
  handler ??= accountHost({ SESSION_SECRET: process.env.SESSION_SECRET ?? '', ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS });
  const visitor = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  // The shared code answers at /v1/account, whatever path the platform routed through.
  const body = request.method === 'POST' ? await request.text() : undefined;
  return handler(new Request(new URL('/v1/account', request.url), { method: request.method, headers: request.headers, body }), visitor);
}
export const POST = handle, OPTIONS = handle;
