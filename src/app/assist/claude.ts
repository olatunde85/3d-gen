/**
 * Optional in-app generation with the user's own Anthropic API key. The key stays in this browser
 * and is sent only to api.anthropic.com. The SDK is loaded on first use, so the apps don't pay for it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { extractJson, fixRequest } from './extract';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'Best results', input: 4, output: 20, cacheRead: 0.2, fallbacks: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Faster, about half the cost', input: 2, output: 10, cacheRead: 0.2, fallbacks: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'Fastest and cheapest, simple briefs', input: 0.1, output: 0.5, cacheRead: 0.01, fallbacks: false },
] as const;
export type ModelId = typeof MODELS[number]['id'];
export const modelOf = (id: string) => MODELS.find(m => m.id === id) ?? MODELS[0];

const KEY = 'ara.assist.anthropic.v1';
export interface Connection { key: string; model: ModelId }
export function loadConnection(): Connection | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved.key === 'string' && saved.key.startsWith('sk-')) return { key: saved.key, model: modelOf(saved.model).id };
  } catch { /* No saved key. */ }
}
export function saveConnection(c: Connection) { localStorage.setItem(KEY, JSON.stringify(c)); }
export function forgetConnection() { try { localStorage.removeItem(KEY); } catch { /* Already gone. */ } }
export const maskKey = (key: string) => `${key.slice(0, 10)}…${key.slice(-4)}`;

/**
 * The site's relay (scripts/anthropic-relay-core.ts), when it has one. Some organisations block calls
 * made directly from web pages; through the relay the same call is made server-side, so every key works.
 */
let relayBase: Promise<string | undefined> | undefined;
const findRelay = () => relayBase ??= (async () => {
  const url = new URL(`${import.meta.env.BASE_URL}anthropic-relay`, location.href).href;
  try { const r = await fetch(`${url}/ping`, { cache: 'no-store' }); if (r.ok && (await r.json()).relay === 'anthropic') return url; }
  catch { /* No relay: call Anthropic directly. */ }
})();

async function client(apiKey: string) {
  const [{ default: Client }, baseURL] = await Promise.all([import('@anthropic-ai/sdk'), findRelay()]);
  return { Client, relayed: !!baseURL, api: new Client({ apiKey, baseURL, dangerouslyAllowBrowser: true, maxRetries: 2 }) };
}

/** Plain-language message for any failure from the SDK. */
async function friendly(error: unknown, model: string): Promise<Error> {
  const { default: A } = await import('@anthropic-ai/sdk');
  if (error instanceof A.APIUserAbortError) return Error('Stopped.');
  if (error instanceof A.AuthenticationError) return Error('Anthropic rejected this API key. Check it, or create a new one in the Anthropic Console.');
  if (error instanceof A.PermissionDeniedError) return Error(`This key can't use ${modelOf(model).name}. Choose another model or check your organisation's settings.`);
  if (error instanceof A.NotFoundError) return Error(`${modelOf(model).name} isn't available to this key. Choose another model.`);
  if (error instanceof A.RateLimitError) return Error('Your API rate limit was reached. Wait a minute, then try again.');
  // Browsers report blocked cross-origin calls as connection failures: a wrong key, or an organisation
  // that doesn't allow calls from web pages. The relay avoids both.
  if (error instanceof A.APIConnectionError) return Error(await findRelay()
    ? 'Couldn\'t reach Anthropic through this site. Check your connection, then try again.'
    : 'Anthropic refused a call from this web page. Check the key is correct. If it is, your organisation blocks browser calls: run Ara with npm run dev or npm run preview (they include a relay), or deploy with the Cloudflare Pages Function in functions/.');
  if (error instanceof A.InternalServerError || error instanceof A.APIError && error.status === 529) return Error('Claude is busy right now. Try again in a moment.');
  if (error instanceof A.APIError) return Error(`Anthropic API error ${error.status ?? ''}: ${error.message}`.trim());
  return error instanceof Error ? error : Error(String(error));
}

/** Checks the key with a free models lookup. */
export async function checkConnection(c: Connection): Promise<void> {
  try { const { api } = await client(c.key); await api.models.retrieve(c.model); }
  catch (error) { throw await friendly(error, c.model); }
}

export interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number }
export const costOf = (u: Usage, model: string) => {
  const m = modelOf(model);
  return (u.input * m.input + u.cacheWrite * m.input * 1.25 + u.cacheRead * m.cacheRead + u.output * m.output) / 1e6;
};
export type Phase = 'connecting' | 'thinking' | 'writing' | 'checking' | 'fixing';
export interface Progress { phase: Phase; attempt: number; chars: number; error?: string }

/** Thrown when every attempt produced JSON that Ara still rejects; carries the last attempt. */
export class StillInvalid extends Error {
  constructor(message: string, readonly json: string, readonly usage: Usage) { super(message); }
}

export interface GenerateOptions<T> {
  connection: Connection;
  /** The large, fixed guide: cached between requests. */
  system: string;
  /** The brief and any current film or character. */
  prompt: string;
  kind: string;
  /** Validates the extracted JSON; throws a readable error when Ara can't use it. */
  accept(json: string): T;
  onProgress(p: Progress): void;
  signal: AbortSignal;
  repairs?: number;
}

export async function generate<T>(o: GenerateOptions<T>): Promise<{ value: T; json: string; usage: Usage; attempts: number }> {
  const { connection: { key, model }, repairs = 2 } = o;
  const usage: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: o.prompt }];
  try {
    const { api } = await client(key);
    for (let attempt = 1; ; attempt++) {
      o.onProgress({ phase: attempt > 1 ? 'fixing' : 'connecting', attempt, chars: 0 });
      const stream = api.beta.messages.stream({
        model, max_tokens: 32000,
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
        messages,
        // If a safety check declines the request, Anthropic re-runs it on its recommended model.
        ...(modelOf(model).fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }, { signal: o.signal });
      let chars = 0;
      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'thinking') o.onProgress({ phase: 'thinking', attempt, chars });
        else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          chars += event.delta.text.length;
          o.onProgress({ phase: 'writing', attempt, chars });
        }
      }
      const message = await stream.finalMessage();
      usage.input += message.usage.input_tokens; usage.output += message.usage.output_tokens;
      usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0; usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      if (message.stop_reason === 'refusal') throw Error('Claude declined this brief. Try rewording it.');
      if (message.stop_reason === 'max_tokens') throw Error('The answer ran too long. Ask for fewer characters, shots or lines of dialogue.');
      const text = message.content.map(b => b.type === 'text' ? b.text : '').join('');
      const json = extractJson(text);
      o.onProgress({ phase: 'checking', attempt, chars });
      try { return { value: o.accept(json), json, usage, attempts: attempt }; }
      catch (error) {
        const reason = (error as Error).message;
        if (attempt > repairs) throw new StillInvalid(reason, json, usage);
        o.onProgress({ phase: 'fixing', attempt: attempt + 1, chars: 0, error: reason });
        messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: fixRequest(reason, o.kind) });
      }
    }
  } catch (error) {
    if (error instanceof StillInvalid) throw error;
    throw await friendly(error, model);
  }
}
