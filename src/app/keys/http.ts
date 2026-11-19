/** Calls to AI and voice providers, made straight from this page with the visitor's key, and the plain-language errors. */

/** Why a call failed, so Keys and Assist can say what to do. */
export type Problem =
  | 'key'       // The provider rejected the key.
  | 'permission'// The key works but can't do this (a scoped key, a model the account can't use).
  | 'credit'    // No credit, quota or plan allowance left.
  | 'rate'      // Too many requests for now.
  | 'busy'      // The provider is overloaded or down.
  | 'blocked'   // The provider or the account refused a call from a web page.
  | 'workspace' // An Anthropic organisation key that needs a workspace.
  | 'model'     // That model isn't available.
  | 'network'   // No answer at all.
  | 'refused'   // The model declined the request.
  | 'length'    // The answer was cut off at the length limit.
  | 'stopped'   // The visitor stopped it.
  | 'other';

export class ProviderError extends Error {
  constructor(message: string, readonly problem: Problem, readonly status?: number, readonly detail?: string) { super(message); }
}

/**
 * Base URLs. Checks point every provider at a local stand-in with VITE_KEYS_TEST_BASE, so they can play back each
 * real error without real keys.
 */
const TEST_BASE: string | undefined = import.meta.env?.VITE_KEYS_TEST_BASE || (globalThis as { __ARA_KEYS_TEST_BASE?: string }).__ARA_KEYS_TEST_BASE;
export const base = (real: string, id: string) => TEST_BASE ? `${TEST_BASE.replace(/\/$/, '')}/${id}` : real;

export interface Call {
  provider: string;
  url: string;
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  /** Turns a failed response into a ProviderError. */
  fail(status: number, body: string): ProviderError;
}

/** One request with up to two retries on busy and rate-limit answers (after the provider's Retry-After, up to 8 s). */
export async function request(c: Call): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(c.url, {
        method: c.method ?? (c.body === undefined ? 'GET' : 'POST'),
        headers: { ...(c.body === undefined ? {} : { 'content-type': 'application/json' }), ...c.headers },
        body: c.body === undefined ? undefined : JSON.stringify(c.body),
        signal: c.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
    } catch (error) {
      if (c.signal?.aborted) throw new ProviderError('Stopped.', 'stopped');
      // Browsers report a refused cross-origin call the same way as no connection.
      throw new ProviderError(`Couldn't reach ${c.provider}. Check your internet connection. If it works, ${c.provider} or a browser extension may be blocking calls from web pages.`, 'network', undefined, String(error));
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    const error = c.fail(res.status, text);
    const again = (error.problem === 'busy' || error.problem === 'rate' && attempt === 0) && attempt < 2;
    if (!again) throw error;
    const after = Number(res.headers.get('retry-after'));
    await wait(Number.isFinite(after) && after > 0 ? Math.min(8, after) * 1000 : 1500 * (attempt + 1), c.signal);
  }
}

export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('Stopped.', 'stopped'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new ProviderError('Stopped.', 'stopped')); }, { once: true });
  });
}

/** The provider's own message from an error body, when it has one. */
export function messageOf(body: string): string {
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.detail?.message ?? j?.message ?? (typeof j?.detail === 'string' ? j.detail : undefined) ?? (typeof j?.error === 'string' ? j.error : undefined);
    if (typeof m === 'string') return m;
  } catch { /* Not JSON. */ }
  return body.slice(0, 300);
}

/** Server-sent events from a streaming response: yields each event's name and data. */
export async function* events(res: Response, signal?: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const stop = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<string>;
      try { chunk = await reader.read(); }
      catch (error) {
        if (signal?.aborted) throw new ProviderError('Stopped.', 'stopped');
        throw new ProviderError('The connection dropped while the answer was arriving. Try again.', 'network', undefined, String(error));
      }
      if (signal?.aborted) throw new ProviderError('Stopped.', 'stopped');
      if (chunk.done) break;
      buffer += chunk.value.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        let event = 'message', data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).replace(/^ /, '');
        }
        if (data) yield { event, data };
      }
    }
  } finally { signal?.removeEventListener('abort', stop); }
}
