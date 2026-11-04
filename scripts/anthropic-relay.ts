/** Serves the Anthropic relay (see anthropic-relay-core.ts) from `npm run dev` and `npm run preview`. */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { RELAY_PATH, relay } from './anthropic-relay-core';

/** Mounts the relay under the site's base path. */
export function anthropicRelay(base = '/'): Plugin {
  const prefix = `${base.replace(/\/$/, '')}${RELAY_PATH}`;
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return next();
    try {
      const body = req.method === 'POST' ? Readable.toWeb(req) as ReadableStream : undefined;
      const request = new Request(url, { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') as [string, string][], body, duplex: 'half' } as RequestInit);
      const response = await relay(request, url.pathname.slice(prefix.length) || '/');
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body as never).pipe(res); else res.end();
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `The relay could not reach Anthropic: ${(error as Error).message}` } }));
    }
  };
  return {
    name: 'anthropic-relay',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
