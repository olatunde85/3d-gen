/**
 * The providers a visitor can connect with their own key: what each is for, how to recognise its keys, how to check
 * one, and the models it offers. Every call goes straight from the page to the provider (they all allow it).
 */
import { base, messageOf, request, ProviderError, type Problem } from './http';
import type { SavedKey } from './store';

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'elevenlabs';
export type Role = 'ai' | 'voice';

export interface Provider {
  id: ProviderId;
  name: string;
  /** A short name for tight spaces. */
  short: string;
  roles: Role[];
  /** How its keys start, shown so people can tell which key is which. */
  prefix: string;
  keyUrl: string;
  /** A tag such as "Free allowance". */
  free?: string;
  /** One line on what it gives, shown before it's connected, for each thing it does. */
  blurb: Partial<Record<Role, string>>;
  detect(key: string): boolean;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: { id: 'gemini', name: 'Google Gemini', short: 'Gemini', roles: ['ai', 'voice'], prefix: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey', free: 'Free allowance',
    blurb: { ai: 'Writes for Assist. Keys from Google AI Studio include a free daily allowance.', voice: '30 natural voices you can direct, in the same free allowance. One Gemini key covers both.' }, detect: k => /^AIza[\w-]{20,}$/.test(k) },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', short: 'Claude', roles: ['ai'], prefix: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys',
    blurb: { ai: 'Claude writes for Assist. Very good at following Ara’s rules.' }, detect: k => /^sk-ant-api/.test(k) },
  openai: { id: 'openai', name: 'OpenAI', short: 'OpenAI', roles: ['ai'], prefix: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys',
    blurb: { ai: 'ChatGPT’s models write for Assist.' }, detect: k => /^sk-(?!ant-|or-)[\w-]{20,}$/.test(k) },
  openrouter: { id: 'openrouter', name: 'OpenRouter', short: 'OpenRouter', roles: ['ai'], prefix: 'sk-or-…', keyUrl: 'https://openrouter.ai/settings/keys', free: 'Free models',
    blurb: { ai: 'One key for hundreds of models, including Claude, GPT and Gemini, and some free ones.' }, detect: k => /^sk-or-/.test(k) },
  elevenlabs: { id: 'elevenlabs', name: 'ElevenLabs', short: 'ElevenLabs', roles: ['voice'], prefix: 'sk_…', keyUrl: 'https://elevenlabs.io/app/settings/api-keys', free: 'Free monthly allowance',
    blurb: { voice: 'The most natural voices, with emotion, and your own cloned voices. Free monthly allowance.' }, detect: k => /^sk_[\w-]{20,}$/.test(k) || /^[a-f0-9]{32}$/.test(k) },
};
/** The order providers are listed in Keys. */
export const ORDER: ProviderId[] = ['gemini', 'anthropic', 'openai', 'openrouter', 'elevenlabs'];

export function detectProvider(key: string): ProviderId | undefined {
  return ORDER.find(id => PROVIDERS[id].detect(key.trim()));
}

// ---- Errors ----

const name = (id: ProviderId) => PROVIDERS[id].name;
const consoleOf = (id: ProviderId) => ({ gemini: 'Google AI Studio', anthropic: 'the Anthropic Console', openai: 'the OpenAI dashboard', openrouter: 'OpenRouter', elevenlabs: 'ElevenLabs' }[id]);
const err = (message: string, problem: Problem, status: number, body: string) => new ProviderError(message, problem, status, messageOf(body));

/** Every provider's failures in plain language, with what to do. */
export function failure(id: ProviderId, status: number, body: string): ProviderError {
  const said = messageOf(body), lower = said.toLowerCase();
  let code = '';
  try { const j = JSON.parse(body); code = [j?.error?.code, j?.error?.status, j?.error?.type, ...(j?.error?.details ?? []).map((d: { reason?: string }) => d?.reason), j?.detail?.code, j?.detail?.status, j?.detail?.type].filter(v => typeof v === 'string').join(' '); } catch { /* Not JSON. */ }
  const c = code.toLowerCase();
  const wrongKey = () => err(`${name(id)} didn’t accept this key. Check you copied all of it, or create a new one in ${consoleOf(id)}.`, 'key', status, body);
  const noCredit = (what = 'credit') => err(`Your ${name(id)} account has no ${what} left. Add some in ${consoleOf(id)}, then try again.`, 'credit', status, body);
  const rate = () => err(`${name(id)} says you’ve sent too many requests for now. Wait a minute, then try again.`, 'rate', status, body);
  const busy = () => err(`${name(id)} is busy right now. Try again in a moment.`, 'busy', status, body);

  if (id === 'anthropic') {
    if (lower.includes('cors requests are not allowed')) return err(lower.includes('retention')
      ? 'This key belongs to an Anthropic organisation with zero data retention, which never allows calls from web pages. Use a key from another organisation, or use OpenRouter to reach Claude.'
      : 'This Anthropic organisation doesn’t allow calls from web pages (often because of its compliance settings). The key is fine, but it can’t be used here. Use a key from another organisation, or use OpenRouter to reach Claude.', 'blocked', status, body);
    if (lower.includes('not scoped to a workspace')) return err('This is an organisation-wide key, so Anthropic needs to know which workspace to use. Paste the workspace ID (Console › Workspaces, the ID column), or create a key inside a workspace instead.', 'workspace', status, body);
    if (lower.includes('workspace') && (status === 404 || lower.includes('valid workspace'))) return err('Anthropic couldn’t find that workspace. Copy the ID from Console › Workspaces; it starts with wrkspc_.', 'workspace', status, body);
    if (status === 401) return wrongKey();
    if (status === 402 || lower.includes('credit balance')) return noCredit();
    if (status === 400 && lower.includes('spend limit')) return err('Your Anthropic spend limit has been reached. Raise it in the Anthropic Console, or wait until it resets.', 'credit', status, body);
    if (status === 403) return err('This Anthropic key isn’t allowed to do this. Check its permissions in the Anthropic Console.', 'permission', status, body);
    if (status === 404) return err('That Claude model isn’t available to this key. Choose another model in Keys.', 'model', status, body);
    if (status === 429) return lower.includes('spend') ? err('Your Anthropic monthly spend cap has been reached. Raise it in the Anthropic Console.', 'credit', status, body) : rate();
    if (status === 529 || status >= 500) return busy();
  }
  if (id === 'openai') {
    if (status === 401) return wrongKey();
    if (c.includes('insufficient_quota') || c.includes('credit_balance_exhausted') || lower.includes('quota')) return noCredit();
    if (c.includes('project_spend_limit_exceeded')) return err('This OpenAI project has reached its spend limit. Raise it in the OpenAI dashboard.', 'credit', status, body);
    if (status === 403) return err(lower.includes('country') ? 'OpenAI doesn’t offer its API in your country or region.' : 'This OpenAI key isn’t allowed to do this. Check its permissions in the OpenAI dashboard.', 'permission', status, body);
    if (status === 404) return err('That OpenAI model isn’t available to this key. Choose another model in Keys.', 'model', status, body);
    if (status === 429) return rate();
    if (status >= 500) return busy();
  }
  if (id === 'gemini') {
    if (c.includes('api_key_invalid') || lower.includes('api key not valid') || status === 401) return wrongKey();
    if (lower.includes('leaked')) return err('Google has blocked this key because it was found in public. Create a new key in Google AI Studio.', 'key', status, body);
    if (lower.includes('verification') || c.includes('verification')) return err('Google needs you to verify your account before this key can use the free allowance. Follow the prompt in Google AI Studio.', 'permission', status, body);
    if (status === 402 || lower.includes('billing') && status === 400) return noCredit('prepaid credit or billing');
    if (status === 403) return err(lower.includes('free tier') ? 'This model isn’t in Google’s free allowance. Choose a Flash model in Keys, or turn on billing in Google AI Studio.' : 'This Google key isn’t allowed to use Gemini. Check the key’s restrictions in Google AI Studio.', 'permission', status, body);
    if (status === 404) return err('That Gemini model isn’t available to this key. Choose another model in Keys.', 'model', status, body);
    if (status === 429) return lower.includes('quota') || lower.includes('per day') || c.includes('quota_exceeded') || c.includes('resource_exhausted')
      ? err('You’ve used today’s Gemini allowance for this model. It resets daily; try another model in Keys, or turn on billing in Google AI Studio.', 'credit', status, body) : rate();
    if (status >= 500) return busy();
  }
  if (id === 'openrouter') {
    if (status === 401) return wrongKey();
    if (status === 402) return noCredit('credits');
    if (status === 403) return err('OpenRouter’s moderation declined this request. Try rewording it, or choose another model.', 'refused', status, body);
    if (status === 404) return err('That model isn’t available on OpenRouter now. Choose another model in Keys.', 'model', status, body);
    if (status === 429) return lower.includes('free') ? err('You’ve used today’s free OpenRouter requests. Try again tomorrow, choose a paid model, or add credits.', 'credit', status, body) : rate();
    if (status === 502 || status === 503 || status === 408) return err('That model is unavailable on OpenRouter right now. Try again shortly, or choose another model.', 'busy', status, body);
    if (status >= 500) return busy();
  }
  if (id === 'elevenlabs') {
    if (c.includes('quota_exceeded') || c.includes('insufficient_credits') || status === 402) return err('Your ElevenLabs allowance is used up for this month. It resets monthly, or you can upgrade your plan.', 'credit', status, body);
    if (c.includes('missing_permissions') || c.includes('insufficient_permissions')) return err(`This ElevenLabs key is restricted. In ElevenLabs › API keys, allow ${lower.includes('voices') || lower.includes('voice') ? 'Voices (read)' : 'Text to Speech, Voices (read) and User (read)'} for it.`, 'permission', status, body);
    if (status === 401) return wrongKey();
    if (c.includes('voice_access_denied') || c.includes('voice_not_found')) return err('That ElevenLabs voice isn’t available to this account any more. Choose another voice.', 'model', status, body);
    if (c.includes('model_access_denied') || c.includes('subscription_required')) return err('Your ElevenLabs plan doesn’t include this voice model.', 'permission', status, body);
    if (c.includes('text_too_long')) return err('This line is too long for ElevenLabs. Split it into two lines.', 'other', status, body);
    if (status === 403) return err(lower.includes('ip') ? 'This ElevenLabs key only works from certain internet addresses. Remove the IP restriction in ElevenLabs › API keys.' : 'This ElevenLabs key isn’t allowed to do this. Check its permissions in ElevenLabs › API keys.', 'permission', status, body);
    if (status === 429) return c.includes('system_busy') ? busy() : rate();
    if (status >= 500) return busy();
  }
  return err(`${name(id)} couldn’t do this (${status}): ${said || 'no details'}`, 'other', status, body);
}

// ---- Models ----

/** Prices in US dollars per million tokens. */
export interface Price { input: number; output: number; cached?: number }
export interface ModelInfo { id: string; name: string; note?: string; detail?: string; price?: Price; free?: boolean; maxOutput?: number }

/**
 * Models Ara knows well, best first within each provider, with published prices (November 2026). The first one the key
 * can use becomes the default. Others the key offers are listed after them.
 */
const KNOWN: Record<'anthropic' | 'openai' | 'gemini', ModelInfo[]> = {
  anthropic: [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'Recommended', detail: 'Best results for films and games. About 10–30 cents a request.', price: { input: 4, output: 20, cached: .4 }, maxOutput: 32000 },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Half the cost', detail: 'Very good and faster. About 5–15 cents a request.', price: { input: 2, output: 10, cached: .2 }, maxOutput: 32000 },
    { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', note: 'Most capable', detail: 'The strongest Claude, at twice Opus’s price.', price: { input: 8, output: 40, cached: .8 }, maxOutput: 32000 },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'Cheapest', detail: 'Fine for characters; may struggle with large films.', price: { input: .1, output: .5, cached: .01 }, maxOutput: 32000 },
  ],
  openai: [
    { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol', note: 'Recommended', detail: 'OpenAI’s everyday flagship. About 5–15 cents a request.', price: { input: 2, output: 10, cached: .1 } },
    { id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra', note: 'Most capable', detail: 'OpenAI’s strongest model, at four times Sol’s price.', price: { input: 8, output: 40, cached: .4 } },
    { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', note: 'Half the cost', price: { input: 1, output: 5, cached: .05 } },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', note: 'Cheapest', detail: 'Fine for characters; may struggle with large films.', price: { input: .1, output: .5, cached: .01 } },
  ],
  gemini: [
    { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', note: 'Recommended · free allowance', detail: 'Strong, and covered by Google’s free daily allowance.', price: { input: 1.5, output: 7.5 }, free: true },
    { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', note: 'Most capable · needs billing', detail: 'Google’s strongest model. Not in the free allowance.', price: { input: 2, output: 10 } },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'Fast · free allowance', price: { input: .75, output: 3.75 }, free: true },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', note: 'Cheapest · free allowance', detail: 'Fine for characters; may struggle with large films.', price: { input: .3, output: 2.5 }, free: true },
  ],
};
/** OpenRouter's picks, matched against its catalogue. */
const OPENROUTER_PICKS = [/^anthropic\/claude-opus-5\.?5/, /^anthropic\/claude-sonnet-5\.?5/, /^openai\/gpt-6\.2-sol/, /^google\/gemini-4-hydrogen/, /^google\/gemini-4-carbon/];

export const modelInfo = (id: ProviderId, model: string): ModelInfo | undefined =>
  (KNOWN as Record<string, ModelInfo[]>)[id]?.find(m => m.id === model) ?? openrouterCache?.find(m => m.id === model);
let openrouterCache: ModelInfo[] | undefined;

/** Headers for a provider, with the visitor's key. */
export function headers(id: ProviderId, saved: SavedKey): Record<string, string> {
  if (id === 'anthropic') return { 'x-api-key': saved.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', ...(saved.workspace ? { 'anthropic-workspace-id': saved.workspace } : {}) };
  if (id === 'gemini') return { 'x-goog-api-key': saved.key };
  if (id === 'elevenlabs') return { 'xi-api-key': saved.key };
  if (id === 'openrouter') return { authorization: `Bearer ${saved.key}`, 'x-openrouter-title': 'Ara 3D' };
  return { authorization: `Bearer ${saved.key}` };
}
export const URLS: Record<ProviderId, string> = {
  anthropic: base('https://api.anthropic.com/v1', 'anthropic'),
  openai: base('https://api.openai.com/v1', 'openai'),
  gemini: base('https://generativelanguage.googleapis.com/v1beta', 'gemini'),
  openrouter: base('https://openrouter.ai/api/v1', 'openrouter'),
  elevenlabs: base('https://api.elevenlabs.io', 'elevenlabs'),
};
export const call = (id: ProviderId, saved: SavedKey, path: string, init: { body?: unknown; signal?: AbortSignal; method?: 'GET' | 'POST' } = {}) =>
  request({ provider: name(id), url: URLS[id] + path, headers: headers(id, saved), ...init, fail: (status, body) => failure(id, status, body) });

/** The AI models this key can use, best first. */
export async function aiModels(id: ProviderId, saved: SavedKey, signal?: AbortSignal): Promise<ModelInfo[]> {
  if (id === 'anthropic' || id === 'openai') {
    const ids = new Set<string>();
    let after = '';
    for (let page = 0; page < 5; page++) {
      const j = await (await call(id, saved, `/models${id === 'anthropic' ? `?limit=1000${after ? `&after_id=${after}` : ''}` : ''}`, { signal })).json();
      for (const m of j.data ?? []) ids.add(m.id);
      if (!j.has_more || !j.last_id) break;
      after = j.last_id;
    }
    return pick(id, ids, m => id === 'anthropic' ? /^claude-/.test(m) : /^(gpt-\d|o\d)/.test(m) && !/(audio|realtime|tts|transcribe|image|search|embedding|moderation|codex|instruct)/.test(m));
  }
  if (id === 'gemini') {
    const ids = new Set<string>();
    let token = '';
    for (let page = 0; page < 5; page++) {
      const j = await (await call(id, saved, `/models?pageSize=1000${token ? `&pageToken=${token}` : ''}`, { signal })).json();
      for (const m of j.models ?? []) if ((m.supportedGenerationMethods ?? ['generateContent']).includes('generateContent')) ids.add(String(m.name).replace(/^models\//, ''));
      if (!j.nextPageToken) break;
      token = j.nextPageToken;
    }
    return pick(id, ids, m => /^gemini-/.test(m) && !/(tts|image|audio|live|embedding|robotics|computer)/.test(m));
  }
  if (id === 'openrouter') {
    const j = await (await call(id, saved, '/models/user', { signal })).json();
    const all: ModelInfo[] = (j.data ?? []).filter((m: { architecture?: { output_modalities?: string[] } }) => (m.architecture?.output_modalities ?? ['text']).includes('text')).map((m: { id: string; name?: string; pricing?: Record<string, string>; top_provider?: { max_completion_tokens?: number } }) => {
      const per = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n * 1e6 : undefined; };
      const input = per(m.pricing?.prompt), output = per(m.pricing?.completion), free = input === 0 && output === 0;
      return { id: m.id, name: m.name ?? m.id, ...(input !== undefined && output !== undefined ? { price: { input, output, ...(per(m.pricing?.input_cache_read) !== undefined ? { cached: per(m.pricing?.input_cache_read) } : {}) } } : {}), ...(free ? { free: true, note: 'Free' } : {}), ...(m.top_provider?.max_completion_tokens ? { maxOutput: m.top_provider.max_completion_tokens } : {}) };
    });
    const picks = OPENROUTER_PICKS.map(re => all.find(m => re.test(m.id))).filter((m): m is ModelInfo => !!m).map((m, i): ModelInfo => ({ ...m, note: i === 0 ? 'Recommended' : m.note }));
    const rest = all.filter(m => !picks.includes(m)).sort((a, b) => a.name.localeCompare(b.name));
    return openrouterCache = [...picks, ...rest];
  }
  return [];
}
function pick(id: 'anthropic' | 'openai' | 'gemini', ids: Set<string>, keep: (m: string) => boolean): ModelInfo[] {
  const known = KNOWN[id].filter(m => ids.has(m.id));
  const rest = [...ids].filter(m => keep(m) && !known.some(k => k.id === m)).sort().reverse().map(m => ({ id: m, name: m }));
  return [...known, ...rest];
}

/**
 * The visitor's ElevenLabs voices. /v1/voices returns them all at once; /v2/voices (paged) is the fallback, since
 * either can fail the browser's permission check on a given day.
 */
export async function elevenVoiceList(saved: SavedKey, signal?: AbortSignal): Promise<{ voices: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string }[]; total_count?: number }> {
  try { return await (await call('elevenlabs', saved, '/v1/voices', { signal })).json(); }
  catch (error) {
    if ((error as ProviderError).problem !== 'network') throw error;
    const all: { voice_id: string; name: string }[] = [];
    let token = '';
    for (let page = 0; page < 10; page++) {
      const j = await (await call('elevenlabs', saved, `/v2/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`, { signal })).json();
      all.push(...(j.voices ?? []));
      if (!j.has_more || !j.next_page_token) break;
      token = j.next_page_token;
    }
    return { voices: all };
  }
}

export interface CheckResult { note: string; models?: ModelInfo[] }

/** Checks a key with a free call and describes what it gives. Throws a ProviderError explaining any problem. */
export async function checkKey(id: ProviderId, saved: SavedKey, signal?: AbortSignal): Promise<CheckResult> {
  if (id === 'elevenlabs') {
    const voices = await elevenVoiceList(saved, signal);
    const own = (voices.voices ?? []).filter((v: { category?: string }) => v.category && v.category !== 'premade').length;
    let allowance = '';
    try {
      const sub = await (await call(id, saved, '/v1/user/subscription', { signal })).json();
      if (Number.isFinite(sub.character_limit)) allowance = ` · ${Math.max(0, sub.character_limit - sub.character_count).toLocaleString()} characters left this month`;
    } catch { /* A key without User (read) still works for voices. */ }
    return { note: `Connected · ${voices.total_count ?? voices.voices?.length ?? 0} voices${own ? `, ${own} of your own` : ''}${allowance}` };
  }
  const models = await aiModels(id, saved, signal);
  if (!models.length) throw new ProviderError(`This ${name(id)} key works, but it can’t use any models that write text.`, 'permission');
  if (id === 'openrouter') {
    try {
      const k = (await (await call(id, saved, '/key', { signal })).json()).data;
      const left = typeof k?.limit_remaining === 'number' ? ` · $${k.limit_remaining.toFixed(2)} left on this key` : '';
      return { models, note: `Connected · ${models.length} models${k?.is_free_tier ? ' · free models only until you add credits' : left}` };
    } catch { /* The key details are optional. */ }
  }
  const voice = id === 'gemini' ? ' · voices included' : '';
  return { models, note: `Connected · ${models.length} models${voice}` };
}
