/** Cloudflare Pages Function: the Anthropic relay for LLM Assist's "Generate here" on deployed sites. */
import { RELAY_PATH, relay } from '../../scripts/anthropic-relay-core';

export const onRequest = ({ request }: { request: Request }) =>
  relay(request, new URL(request.url).pathname.slice(RELAY_PATH.length) || '/');
