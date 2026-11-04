/** Find the JSON object inside whatever an AI assistant replied: prose, code fences, or JSON alone. */

/** The end of the balanced object that starts at `start`, honouring strings and escapes. */
function objectEnd(text: string, start: number): number {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

const parses = (text: string) => { try { JSON.parse(text); return true; } catch { return false; } };

/**
 * Returns the most likely JSON object in `reply`, or the trimmed reply when none parses (so the
 * validator reports a useful error). Prefers fenced blocks, then the largest top-level object.
 */
export function extractJson(reply: string): string {
  const text = reply.trim().replace(/^﻿/, '');
  if (text.startsWith('{') && parses(text)) return text;
  const candidates: string[] = [];
  for (const m of text.matchAll(/```[a-z]*[ \t]*\n([\s\S]*?)\n?```/gi)) candidates.push(m[1].trim());
  for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
    const end = objectEnd(text, i);
    if (end > 0) { candidates.push(text.slice(i, end)); i = end - 1; }
  }
  const valid = candidates.filter(c => c.startsWith('{') && parses(c)).sort((a, b) => b.length - a.length);
  return valid[0] ?? text;
}

/** True when `reply` holds more than the bare JSON, so the editor can show the clean version. */
export const hadSurroundingText = (reply: string, json: string) => reply.trim() !== json;

/** A message the user can send back to their assistant when Ara rejects its JSON. */
export function fixRequest(error: string, kind: string): string {
  return `Ara rejected that ${kind} JSON with this error:\n\n${error}\n\nFix that problem (and anything similar) using only the IDs, fields and ranges in the guide, then return the complete corrected JSON object and nothing else.`;
}
