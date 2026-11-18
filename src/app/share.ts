/**
 * Sharing: a link that rebuilds the exact character (settings compressed into the
 * URL hash, no server needed), a branded share image, and one-tap posting to
 * social networks.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { DEFAULT_PARAMS, sanitizeParams, type HumanParams } from '../core/params';

// --- Links -----------------------------------------------------------------------------------

/** Settings that differ from the defaults (the detail level stays the viewer's choice). */
function diff(p: HumanParams): Partial<HumanParams> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'detail') continue;
    if (JSON.stringify(v) !== JSON.stringify((DEFAULT_PARAMS as unknown as Record<string, unknown>)[k])) out[k] = v;
  }
  return out as Partial<HumanParams>;
}

export const toB64Url = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeCharacter(p: HumanParams): string {
  return toB64Url(deflateSync(strToU8(JSON.stringify(diff(p))), { level: 9 }));
}

/** Character from a shared link's `c` value (sanitised: links are untrusted input), or null. */
export function decodeCharacter(code: string, detail: HumanParams['detail']): HumanParams | null {
  try {
    if (code.length > 8000) return null;
    const raw = JSON.parse(strFromU8(inflateSync(fromB64Url(code))));
    return { ...sanitizeParams({ ...DEFAULT_PARAMS, ...raw }), detail };
  } catch {
    return null;
  }
}

export function shareLink(p: HumanParams): string {
  return `${location.origin}${location.pathname}#c=${encodeCharacter(p)}`;
}

// --- Share image -------------------------------------------------------------------------------

/** 1200x675 branded card: the character as currently framed in the viewer, its name and the brand. */
export async function shareCard(source: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number } | null, name: string): Promise<Blob> {
  const W = 1200, H = 675;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Background: the site's dark gradient with a blue glow.
  g.fillStyle = '#0f1116';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(330, 300, 40, 330, 300, 520);
  glow.addColorStop(0, 'rgba(91,140,255,0.32)');
  glow.addColorStop(1, 'rgba(91,140,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Character, fitted into the left half.
  const boxW = 560, boxH = 615;
  // Widen (or heighten) the crop around the character to the panel's shape, so the scene fills it.
  let r = rect ?? { x: 0, y: 0, w: source.width, h: source.height };
  const want = boxW / boxH;
  if (r.w / r.h < want) {
    const w = Math.min(source.width, r.h * want);
    r = { ...r, x: Math.min(Math.max(0, r.x + r.w / 2 - w / 2), source.width - w), w };
  } else {
    const h = Math.min(source.height, r.w / want);
    r = { ...r, y: Math.min(Math.max(0, r.y + r.h / 2 - h / 2), source.height - h), h };
  }
  const s = Math.min(boxW / r.w, boxH / r.h);
  const dw = r.w * s, dh = r.h * s, dx = 50 + (boxW - dw) / 2, dy = 30 + (boxH - dh) / 2;
  g.save();
  g.beginPath();
  g.roundRect(40, 20, boxW + 20, H - 40, 28);
  g.clip();
  g.fillStyle = '#1b2130';
  g.fillRect(40, 20, boxW + 20, H - 40);
  g.drawImage(source, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
  g.restore();
  g.strokeStyle = '#2b3446';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(40, 20, boxW + 20, H - 40, 28);
  g.stroke();

  // Text column.
  const x = 660;
  const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.fillStyle = '#9db9ff';
  g.font = font(700, 20);
  g.fillText('MADE WITH ARA 3D GEN', x, 150);
  g.fillStyle = '#ffffff';
  // Character name, wrapped to at most three lines.
  g.font = font(800, 58);
  const words = (name.trim() || 'My character').split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > 480 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, x, 225 + i * 66));
  const y = 225 + Math.min(3, lines.length) * 66 + 10;
  g.fillStyle = '#c9d3e6';
  g.font = font(500, 26);
  g.fillText('Realistic · rigged · animated', x, y);
  g.fillText('Free and open source', x, y + 38);
  // Call to action.
  g.fillStyle = '#5b8cff';
  g.beginPath();
  g.roundRect(x, H - 150, 330, 64, 32);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = font(700, 26);
  g.fillText('Create yours free →', x + 30, H - 109);
  g.fillStyle = '#8b93a1';
  g.font = font(500, 20);
  g.fillText(location.host || 'Ara 3D Gen', x, H - 50);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not render image'))), 'image/png'));
}

// --- Social networks ------------------------------------------------------------------------------

export const defaultCaption = (name: string) =>
  `I just created "${name.trim() || 'my character'}" on Ara 3D Gen 🎮 Make your own realistic, rigged 3D character for free. #Ara3DGen #gamedev`;

const q = encodeURIComponent;
/** Share URLs: websites can pass text and a link to these, but not an image. */
export const NETWORKS: { id: string; label: string; url: (caption: string, link: string) => string }[] = [
  { id: 'x', label: 'X', url: (t, l) => `https://x.com/intent/post?text=${q(t)}&url=${q(l)}` },
  { id: 'facebook', label: 'Facebook', url: (_t, l) => `https://www.facebook.com/sharer/sharer.php?u=${q(l)}` },
  { id: 'linkedin', label: 'LinkedIn', url: (_t, l) => `https://www.linkedin.com/sharing/share-offsite/?url=${q(l)}` },
  { id: 'whatsapp', label: 'WhatsApp', url: (t, l) => `https://wa.me/?text=${q(`${t} ${l}`)}` },
  { id: 'reddit', label: 'Reddit', url: (t, l) => `https://www.reddit.com/submit?url=${q(l)}&title=${q(t)}` },
  { id: 'telegram', label: 'Telegram', url: (t, l) => `https://t.me/share/url?url=${q(l)}&text=${q(t)}` },
];
