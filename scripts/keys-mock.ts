/**
 * A local stand-in for every AI and voice provider Keys supports, for checks without real keys. Each provider lives
 * under its own path (/anthropic, /openai, /gemini, /openrouter, /elevenlabs) and answers like the real API: the same
 * streams, the same error bodies (taken from the providers' documentation and live wrong-key answers), and CORS.
 *
 * A key picks the scenario by its ending: -bad, -nocredit, -rate, -busy, -cors, -zdr, -workspace, -scoped, -quota,
 * -verify, -leaked, -nomodels, -midstream, -cut, -refuse, -eleven-old, -slow (replies arrive slowly). Anything else is a good key.
 * POST /__replies queues the AI's next replies (a JSON array of strings); GET /__log lists the requests received.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export interface MockLog { provider: string; path: string; method: string; headers: Record<string, string>; body?: unknown }

function sine(seconds: number, rate = 24000) {
  const n = Math.round(seconds * rate), out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * 9000 * Math.min(1, i / 2400, (n - i) / 2400)), i * 2);
  return out;
}

export async function startKeysMock(port = 0) {
  const replies: string[] = [], log: MockLog[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: unknown; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    if (url.pathname === '/__replies') { replies.push(...(body as string[])); res.end('ok'); return; }
    if (url.pathname === '/__log') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(log)); return; }
    if (url.pathname === '/__reset') { replies.length = 0; log.length = 0; res.end('ok'); return; }
    const [, provider, ...rest] = url.pathname.split('/'), path = '/' + rest.join('/');
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    log.push({ provider, path: path + url.search, method: req.method ?? 'GET', headers, body });
    const key = headers['x-api-key'] ?? headers['xi-api-key'] ?? headers['x-goog-api-key'] ?? headers.authorization?.replace(/^Bearer /, '') ?? '';
    const scenario = /-(bad|nocredit|rate|busy|cors|zdr|workspace|scoped|quota|verify|leaked|nomodels|midstream|cut|refuse|eleven-old|slow)$/.exec(key)?.[1] ?? 'good';
    try { await answer(provider, path, req, res, key, scenario, body, replies, headers); }
    catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise<void>(r => server.listen(port, '127.0.0.1', r));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}`, log, replies, close: () => new Promise<void>(r => server.close(() => r())) };
}

const json = (res: ServerResponse, status: number, value: unknown, extra: Record<string, string> = {}) => {
  res.statusCode = status; res.setHeader('content-type', 'application/json');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(value));
};
const sse = (res: ServerResponse) => { res.statusCode = 200; res.setHeader('content-type', 'text/event-stream'); res.setHeader('cache-control', 'no-cache'); };
const pieces = (text: string) => text.match(/[\s\S]{1,40}/g) ?? [''];
let slow = false;
const tick = () => new Promise(r => setTimeout(r, slow ? 90 : 2));

async function answer(provider: string, path: string, req: IncomingMessage, res: ServerResponse, key: string, scenario: string, body: any, replies: string[], headers: Record<string, string>) {
  slow = scenario === 'slow';
  const next = () => replies.shift() ?? '{"note":"no reply queued"}';
  // ---- Anthropic ----
  if (provider === 'anthropic') {
    const e = (status: number, type: string, message: string) => json(res, status, { type: 'error', error: { type, message }, request_id: 'req_mock' });
    if (!key) return e(401, 'authentication_error', 'x-api-key header is required');
    if (headers['anthropic-dangerous-direct-browser-access'] !== 'true') return e(401, 'authentication_error', 'CORS requests must set the anthropic-dangerous-direct-browser-access header');
    if (scenario === 'bad') return e(401, 'authentication_error', 'invalid x-api-key');
    if (scenario === 'cors') return e(401, 'authentication_error', 'CORS requests are not allowed for this Organization because of its settings. Please contact your organization admin.');
    if (scenario === 'zdr') return e(401, 'authentication_error', 'CORS requests are not allowed for this Organization because of custom retention settings.');
    if (scenario === 'workspace' && !headers['anthropic-workspace-id']) return e(400, 'invalid_request_error', 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use. Add the header, or use an API key that is scoped to a workspace.');
    if (scenario === 'workspace' && headers['anthropic-workspace-id'] !== 'wrkspc_good') return e(404, 'not_found_error', `Workspace \`${headers['anthropic-workspace-id']}\` not found.`);
    if (path.startsWith('/models')) return json(res, 200, { data: scenario === 'nomodels' ? [] : ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-sonnet-4-6'].map(id => ({ id, type: 'model', display_name: id })), has_more: false, first_id: 'a', last_id: 'b' });
    if (path === '/messages') {
      if (scenario === 'nocredit') return e(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');
      if (scenario === 'rate') return e(429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit');
      if (scenario === 'busy') return e(529, 'overloaded_error', 'Overloaded');
      if (body.model === 'claude-missing') return e(404, 'not_found_error', 'model: claude-missing');
      const text = scenario === 'refuse' ? '' : next();
      sse(res);
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', { type: 'message_start', message: { usage: { input_tokens: 9000, cache_creation_input_tokens: body.messages[0].content?.[0]?.cache_control ? 1000 : 0, cache_read_input_tokens: body.messages.length > 1 ? 8000 : 0, output_tokens: 1 } } });
      send('ping', { type: 'ping' });
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const [i, p] of pieces(text).entries()) {
        if (scenario === 'midstream' && i === 2) { send('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }); res.end(); return; }
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }); await tick();
      }
      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', { type: 'message_delta', delta: { stop_reason: scenario === 'cut' ? 'max_tokens' : scenario === 'refuse' ? 'refusal' : 'end_turn' }, usage: { output_tokens: Math.ceil(text.length / 4) } });
      send('message_stop', { type: 'message_stop' });
      return res.end();
    }
  }
  // ---- OpenAI ----
  if (provider === 'openai') {
    const e = (status: number, type: string, code: string | null, message: string) => json(res, status, { error: { message, type, param: null, code } });
    if (scenario === 'bad') return e(401, 'invalid_request_error', 'invalid_api_key', 'Incorrect API key provided: sk-proj-***-bad. You can find your API key at https://platform.openai.com/account/api-keys.');
    if (path === '/models') return json(res, 200, { object: 'list', data: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna', 'gpt-4o-mini-tts', 'text-embedding-3-large', 'gpt-realtime-2.1-mini', 'gpt-5.2'].map(id => ({ id, object: 'model', created: 1, owned_by: 'openai' })) });
    if (path === '/responses') {
      if (scenario === 'nocredit') return e(429, 'insufficient_quota', 'insufficient_quota', 'You exceeded your current quota, please check your plan and billing details.');
      if (scenario === 'rate') return e(429, 'requests', 'rate_limit_exceeded', 'Rate limit reached for requests');
      if (scenario === 'busy') return e(503, 'server_error', 'server_is_overloaded', 'The server is overloaded');
      const text = next();
      sse(res);
      const send = (data: { type: string } & Record<string, unknown>) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      send({ type: 'response.created', response: { id: 'resp_mock', status: 'in_progress' } });
      for (const p of pieces(text)) { send({ type: 'response.output_text.delta', item_id: 'msg', output_index: 0, content_index: 0, delta: p }); await tick(); }
      if (scenario === 'cut') send({ type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 9000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 32000 } } });
      else send({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 9000, input_tokens_details: { cached_tokens: 4000 }, output_tokens: Math.ceil(text.length / 4) } } });
      return res.end();
    }
  }
  // ---- Gemini ----
  if (provider === 'gemini') {
    const e = (code: number, status: string, message: string, reason?: string) => json(res, code, { error: { code, message, status, ...(reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }] } : {}) } });
    if (scenario === 'bad') return e(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID');
    if (scenario === 'leaked') return e(403, 'PERMISSION_DENIED', 'Your API key was reported as leaked. Please use another API key.');
    if (path.startsWith('/models') && !path.includes(':')) return json(res, 200, { models: ['gemini-4-hydrogen', 'gemini-4-carbon', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'text-embedding-005', 'gemini-3.8-flash-image'].map(id => ({ name: `models/${id}`, displayName: id, supportedGenerationMethods: id.includes('embedding') ? ['embedContent'] : ['generateContent', 'countTokens'] })) });
    if (path.includes(':streamGenerateContent')) {
      if (scenario === 'quota') return e(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generate_content_free_tier_requests, limit: 50, per day.');
      if (scenario === 'verify') return e(403, 'PERMISSION_DENIED', 'Account verification is required to use the free tier.', 'FREE_TIER_VERIFICATION_REQUIRED');
      if (scenario === 'rate') return e(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota). Too many requests per minute.');
      const text = next();
      sse(res);
      const list = pieces(text);
      for (const [i, p] of list.entries()) {
        const last = i === list.length - 1;
        res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: p }] }, ...(last ? { finishReason: scenario === 'cut' ? 'MAX_TOKENS' : 'STOP' } : {}) }], ...(last ? { usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: Math.ceil(text.length / 4), totalTokenCount: 9000 + Math.ceil(text.length / 4) } } : {}) })}\r\n\r\n`);
        await tick();
      }
      return res.end();
    }
    if (path === '/interactions') {
      const item = body?.input?.[0]?.content?.[0], voice = body?.generation_config?.speech_config?.[0]?.voice;
      if (!item?.text || !voice || body?.response_format?.type !== 'audio') return json(res, 400, { error: { code: 'invalid_request', message: 'Bad speech request.' } });
      const pcm = sine(1.1), head = Buffer.alloc(44);
      head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(24000, 24); head.writeUInt32LE(48000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
      return json(res, 200, { id: 'int_mock', status: 'completed', steps: [{ type: 'user_input' }, { type: 'model_output', content: [{ type: 'audio', data: Buffer.concat([head, pcm]).toString('base64') }] }] });
    }
    if (path.includes(':generateContent')) {
      if (scenario === 'quota') return e(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for metric: generate_content_free_tier_requests, per day.');
      const voice = body?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
      if (!voice) return e(400, 'INVALID_ARGUMENT', 'Missing speech config.');
      return json(res, 200, { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: sine(1.2).toString('base64') } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20 } });
    }
  }
  // ---- OpenRouter ----
  if (provider === 'openrouter') {
    const e = (code: number, message: string) => json(res, code, { error: { code, message } });
    if (scenario === 'bad') return e(401, 'User not found.');
    if (path === '/models/user') return json(res, 200, { data: [
      { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5', pricing: { prompt: '0.000004', completion: '0.00002', input_cache_read: '0.0000004' }, architecture: { output_modalities: ['text'] }, top_provider: { max_completion_tokens: 32000 } },
      { id: 'openai/gpt-6.2-sol', name: 'OpenAI: GPT-6.2 Sol', pricing: { prompt: '0.000002', completion: '0.00001' }, architecture: { output_modalities: ['text'] } },
      { id: 'meta/llama-5-70b:free', name: 'Meta: Llama 5 70B (free)', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
      { id: 'black-forest/flux-3', name: 'FLUX 3', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
    ] });
    if (path === '/key') return json(res, 200, { data: { label: 'sk-or-v1-…', limit: 10, limit_remaining: 7.25, usage: 2.75, is_free_tier: false } });
    if (path === '/chat/completions') {
      if (scenario === 'nocredit') return e(402, 'Insufficient credits. Add more using https://openrouter.ai/credits');
      if (scenario === 'rate') return e(429, 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day');
      const text = next();
      sse(res);
      res.write(': OPENROUTER PROCESSING\n\n');
      for (const p of pieces(text)) { res.write(`data: ${JSON.stringify({ id: 'gen', choices: [{ index: 0, delta: { role: 'assistant', content: p }, finish_reason: null }] })}\n\n`); await tick(); }
      if (scenario === 'midstream') { res.write(`data: ${JSON.stringify({ id: 'gen', error: { code: 'server_error', message: 'Provider disconnected' }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] })}\n\n`); return res.end(); }
      res.write(`data: ${JSON.stringify({ id: 'gen', choices: [{ index: 0, delta: {}, finish_reason: scenario === 'cut' ? 'length' : 'stop' }], usage: { prompt_tokens: 9000, completion_tokens: Math.ceil(text.length / 4), prompt_tokens_details: { cached_tokens: 0 }, cost: 0.0421 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
  }
  // ---- ElevenLabs ----
  if (provider === 'elevenlabs') {
    const e = (status: number, type: string, code: string, message: string) => json(res, status, { detail: { type, code, message, status: code, request_id: 'mock' } });
    if (scenario === 'bad') return e(401, 'authentication_error', 'invalid_api_key', 'Invalid API key');
    if (path.startsWith('/v2/voices')) {
      if (scenario === 'scoped') return e(401, 'authorization_error', 'missing_permissions', 'The API key you used is missing the permission voices_read to execute this operation.');
      return json(res, 200, { voices: [
        { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade', labels: { gender: 'female', age: 'young', accent: 'american', description: 'calm' }, preview_url: '' },
        { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade', labels: { gender: 'male', age: 'middle aged', accent: 'american', description: 'deep' }, preview_url: '' },
        { voice_id: 'MyClonedVoice000001', name: 'My narrator', category: 'cloned', labels: {}, preview_url: '' },
      ], has_more: false, total_count: 3 });
    }
    if (path === '/v1/user/subscription') return json(res, 200, { tier: 'free', character_count: 1500, character_limit: 10000, status: 'free' });
    if (path.startsWith('/v1/text-to-speech/')) {
      if (scenario === 'nocredit') return e(402, 'payment_required', 'insufficient_credits', 'You do not have enough credits to complete this request.');
      if (scenario === 'eleven-old' && body.model_id !== 'eleven_multilingual_v2') return e(403, 'authorization_error', 'model_access_denied', `Your subscription does not have access to the model ${body.model_id}.`);
      if (!new URL(req.url ?? '', 'http://x').searchParams.get('output_format')?.startsWith('pcm_')) return e(400, 'validation_error', 'invalid_output_format', 'Expected pcm.');
      res.statusCode = 200; res.setHeader('content-type', 'audio/pcm'); res.end(sine(.9)); return;
    }
  }
  json(res, 404, { error: { message: `The stand-in has no ${provider}${path}` } });
}
