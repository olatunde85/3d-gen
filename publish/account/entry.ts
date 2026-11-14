/** Deno Deploy entry for the account step; bundled to main.js by `npm run publish:build-account`. */
import { accountHost } from '../../src/publish-service/account-host';
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (request: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>): unknown };
let handler: ReturnType<typeof accountHost> | undefined;
Deno.serve((request, info) => {
  handler ??= accountHost({ SESSION_SECRET: Deno.env.get('SESSION_SECRET') ?? '', ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS') });
  // Read the visitor now: the connection details are gone once the request has been answered.
  const visitor = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || info.remoteAddr.hostname;
  return handler(request, visitor);
});
