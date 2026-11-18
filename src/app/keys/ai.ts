/**
 * Writing with the visitor's own AI key: one streaming call shape for every provider, and a loop that asks the model to
 * fix anything Ara rejects before the visitor sees it.
 */
import { events, ProviderError } from './http';
import { call, modelInfo, PROVIDERS, type ModelInfo, type ProviderId } from './providers';
import { keySettings } from './store';
import type { SavedKey } from './store';

export interface Usage { input: number; cached: number; output: number; cost?: number }
export interface Message { role: 'user' | 'assistant'; text: string }
export interface Written { text: string; usage: Usage; stop: 'end' | 'length' | 'refused' }

interface StreamOptions { model: string; messages: Message[]; maxTokens: number; signal?: AbortSignal; onText(chars: number, text: string): void }

const parse = (data: string) => { try { return JSON.parse(data); } catch { return undefined; } };

async function anthropic(saved: SavedKey, o: StreamOptions): Promise<Written> {
  const last = o.messages.length - 1;
  const res = await call('anthropic', saved, '/messages', { signal: o.signal, body: {
    model: o.model, max_tokens: o.maxTokens, stream: true,
    // The long guide is the first message; caching it makes fix-up rounds cheap.
    messages: o.messages.map((m, i) => ({ role: m.role, content: i === 0 && last > 0 ? [{ type: 'text', text: m.text, cache_control: { type: 'ephemeral' } }] : m.text })),
  } });
  let text = '', stop: Written['stop'] = 'end';
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  for await (const { data } of events(res, o.signal)) {
    const e = parse(data); if (!e) continue;
    if (e.type === 'message_start') { const u = e.message?.usage ?? {}; usage.input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); usage.cached = u.cache_read_input_tokens ?? 0; }
    else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') { text += e.delta.text; o.onText(text.length, text); }
    else if (e.type === 'message_delta') { if (e.usage?.output_tokens) usage.output = e.usage.output_tokens; if (e.delta?.stop_reason === 'max_tokens') stop = 'length'; if (e.delta?.stop_reason === 'refusal') stop = 'refused'; }
    else if (e.type === 'error') throw midStream('anthropic', e.error?.type, e.error?.message);
  }
  return { text, usage, stop };
}

async function openai(saved: SavedKey, o: StreamOptions): Promise<Written> {
  const res = await call('openai', saved, '/responses', { signal: o.signal, body: {
    model: o.model, stream: true, store: false, max_output_tokens: o.maxTokens,
    input: o.messages.map(m => ({ role: m.role, content: m.text })),
  } });
  let text = '', stop: Written['stop'] = 'end';
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  for await (const { event, data } of events(res, o.signal)) {
    const e = parse(data); if (!e) continue;
    const type = e.type ?? event;
    if (type === 'response.output_text.delta') { text += e.delta ?? ''; o.onText(text.length, text); }
    else if (type === 'response.refusal.delta' || type === 'response.refusal.done') stop = 'refused';
    else if (type === 'response.completed' || type === 'response.incomplete') {
      const u = e.response?.usage ?? {}, cached = u.input_tokens_details?.cached_tokens ?? 0;
      Object.assign(usage, { input: (u.input_tokens ?? 0) - cached, cached, output: u.output_tokens ?? 0 });
      const why = e.response?.incomplete_details?.reason;
      if (why === 'max_output_tokens') stop = 'length'; else if (why === 'content_filter') stop = 'refused';
    }
    else if (type === 'response.failed') throw midStream('openai', e.response?.error?.code, e.response?.error?.message);
    else if (type === 'error') throw midStream('openai', e.code, e.message);
  }
  return { text, usage, stop };
}

async function gemini(saved: SavedKey, o: StreamOptions): Promise<Written> {
  const res = await call('gemini', saved, `/models/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse`, { signal: o.signal, body: {
    contents: o.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { maxOutputTokens: o.maxTokens },
  } });
  let text = '', stop: Written['stop'] = 'end';
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  for await (const { data } of events(res, o.signal)) {
    const e = parse(data); if (!e) continue;
    if (e.error) throw midStream('gemini', e.error.status, e.error.message);
    if (e.promptFeedback?.blockReason) stop = 'refused';
    const candidate = e.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) if (typeof part.text === 'string' && !part.thought) { text += part.text; o.onText(text.length, text); }
    const why = candidate?.finishReason;
    if (why === 'MAX_TOKENS') stop = 'length';
    else if (why && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(why)) stop = 'refused';
    const u = e.usageMetadata;
    if (u) { const cached = u.cachedContentTokenCount ?? 0; Object.assign(usage, { input: (u.promptTokenCount ?? 0) - cached, cached, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }); }
  }
  return { text, usage, stop };
}

async function openrouter(saved: SavedKey, o: StreamOptions): Promise<Written> {
  const res = await call('openrouter', saved, '/chat/completions', { signal: o.signal, body: {
    model: o.model, stream: true, max_tokens: o.maxTokens,
    messages: o.messages.map(m => ({ role: m.role, content: m.text })),
  } });
  let text = '', stop: Written['stop'] = 'end';
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  for await (const { data } of events(res, o.signal)) {
    if (data === '[DONE]') break;
    const e = parse(data); if (!e) continue;
    if (e.error) throw midStream('openrouter', String(e.error.code ?? ''), e.error.message);
    const choice = e.choices?.[0];
    if (choice?.delta?.content) { text += choice.delta.content; o.onText(text.length, text); }
    if (choice?.finish_reason === 'length') stop = 'length';
    else if (choice?.finish_reason === 'content_filter') stop = 'refused';
    else if (choice?.finish_reason === 'error') throw midStream('openrouter', 'error', 'The model stopped with an error.');
    if (e.usage) { const cached = e.usage.prompt_tokens_details?.cached_tokens ?? 0; Object.assign(usage, { input: (e.usage.prompt_tokens ?? 0) - cached, cached, output: e.usage.completion_tokens ?? 0, ...(typeof e.usage.cost === 'number' ? { cost: e.usage.cost } : {}) }); }
  }
  return { text, usage, stop };
}

/** An error reported inside a stream that had already started. */
function midStream(id: ProviderId, code: unknown, message: unknown) {
  const c = String(code ?? '').toLowerCase(), name = PROVIDERS[id].name;
  if (/overload|busy|unavailable|529|503/.test(c)) return new ProviderError(`${name} became busy partway through. Try again in a moment.`, 'busy');
  if (/rate|429/.test(c)) return new ProviderError(`${name} says you’ve sent too many requests for now. Wait a minute, then try again.`, 'rate');
  return new ProviderError(`${name} stopped partway through: ${String(message ?? 'no details')}`, 'other');
}

const WRITERS = { anthropic, openai, gemini, openrouter } as const;

/** Streams one reply. */
export function write(provider: ProviderId, saved: SavedKey, o: StreamOptions): Promise<Written> {
  const fn = WRITERS[provider as keyof typeof WRITERS];
  if (!fn) throw new ProviderError(`${PROVIDERS[provider].name} doesn’t write text.`, 'other');
  return fn(saved, o);
}

/** Dollars for some tokens, when the model's price is known. */
export function costOf(u: Usage, price?: ModelInfo['price']) {
  if (u.cost !== undefined) return u.cost;
  if (!price) return undefined;
  return (u.input * price.input + u.cached * (price.cached ?? price.input) + u.output * price.output) / 1e6;
}
export const money = (dollars: number) => dollars < .01 ? 'under 1¢' : dollars < 1 ? `${Math.round(dollars * 100)}¢` : `$${dollars.toFixed(2)}`;

/** The connected writer for Assist, if any: the chosen provider and model, and their key. */
export function writer() {
  const s = keySettings();
  if (!s.ai) return undefined;
  const saved = s.keys[s.ai.provider];
  if (!saved) return undefined;
  const info = modelInfo(s.ai.provider, s.ai.model);
  return { provider: s.ai.provider, model: s.ai.model, saved, info, label: info?.name ?? s.ai.model, providerName: PROVIDERS[s.ai.provider].short };
}

/** A rough cost before sending: the guide's tokens in, and a typical reply out. */
export function estimate(guideChars: number, replyTokens: number) {
  const w = writer();
  if (!w) return undefined;
  const input = Math.round(guideChars / 4);
  const cost = costOf({ input, cached: 0, output: replyTokens }, w.info?.price);
  return { input, cost, free: !!w.info?.free };
}

export type Phase = 'sending' | 'writing' | 'checking' | 'fixing';
export interface Progress { phase: Phase; round: number; chars: number; problem?: string }

export class StillWrong extends Error {
  constructor(message: string, readonly json: string, readonly usage: Usage) { super(message); }
}

export interface JsonRequest<T> {
  /** The full guide, which already holds the brief. */
  prompt: string;
  /** What Ara calls the result, for messages: "film", "character" or "game". */
  noun: string;
  /** Finds the JSON in a reply. */
  extract(text: string): string;
  /** Checks it: returns the value, or throws Ara's reason. */
  accept(json: string): T;
  /** The words to send back when Ara rejects a reply. */
  fix(reason: string): string;
  onProgress(p: Progress): void;
  signal: AbortSignal;
  /** How many times to send a rejected reply back before showing it (default 2). */
  repairs?: number;
}

/** Writes JSON with the connected AI and fixes it until Ara accepts it. */
export async function writeJson<T>(r: JsonRequest<T>): Promise<{ value: T; json: string; usage: Usage; rounds: number; cost?: number }> {
  const w = writer();
  if (!w) throw new ProviderError('Connect an AI key in Keys first.', 'key');
  const repairs = r.repairs ?? 2, total: Usage = { input: 0, cached: 0, output: 0 };
  const messages: Message[] = [{ role: 'user', text: r.prompt }];
  const maxTokens = Math.min(w.info?.maxOutput ?? 32000, 32000);
  let reportedCost = 0, anyCost = false;
  for (let round = 1; ; round++) {
    r.onProgress({ phase: round > 1 ? 'fixing' : 'sending', round, chars: 0 });
    let first = true;
    const reply = await write(w.provider, w.saved, { model: w.model, messages, maxTokens, signal: r.signal, onText: chars => {
      if (first) first = false;
      r.onProgress({ phase: round > 1 ? 'fixing' : 'writing', round, chars });
    } });
    total.input += reply.usage.input; total.cached += reply.usage.cached; total.output += reply.usage.output;
    if (reply.usage.cost !== undefined) { reportedCost += reply.usage.cost; anyCost = true; }
    const cost = anyCost ? reportedCost : costOf(total, w.info?.price);
    if (reply.stop === 'refused' && !reply.text.trim()) throw new ProviderError(`${w.label} declined this request. Try rewording your description.`, 'refused');
    if (reply.stop === 'length') throw new ProviderError(`The ${r.noun} was too long for ${w.label} to finish. Ask for fewer characters, scenes or lines, or choose a larger model in Keys.`, 'length');
    r.onProgress({ phase: 'checking', round, chars: reply.text.length });
    const json = r.extract(reply.text);
    try { return { value: r.accept(json), json, usage: total, rounds: round, cost }; }
    catch (error) {
      const reason = (error as Error).message;
      if (round > repairs) throw new StillWrong(reason, json, total);
      r.onProgress({ phase: 'fixing', round: round + 1, chars: 0, problem: reason });
      messages.push({ role: 'assistant', text: reply.text }, { role: 'user', text: r.fix(reason) });
    }
  }
}
