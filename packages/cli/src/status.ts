/**
 * Progress for a terminal: one status line that rewrites itself in place while work runs, then results as plain
 * lines. Logs and pipes (no terminal) get each step once instead, so CI output stays readable. Status goes to
 * stderr; results go to stdout, so `ara3d ... > list.txt` captures only the results.
 */
const live = !!process.stderr.isTTY && !process.env.CI;
let shown = false;

function clear() { if (live && shown) { process.stderr.write('\r\x1b[2K');shown = false; } }

/** Shows what is happening now. In a terminal it replaces the previous status line. */
export function status(text: string) {
  if (live) { process.stderr.write(`\r\x1b[2K${text.slice(0, (process.stderr.columns || 100) - 1)}`);shown = true; }
  else console.error(text);
}

/** A finished result, printed on its own line. */
export function result(text: string) { clear();console.log(text); }

/** A note for the user, such as a tip or a warning. */
export function note(text: string) { clear();console.error(text); }

export function finish() { clear(); }

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** Download progress with speed and time left, for slow connections. */
export function downloadProgress(total: number) {
  const started = performance.now();let lastPercent = -1, lastDraw = 0;
  return (received: number) => {
    const percent = Math.floor((received / total) * 100), now = performance.now();
    if (live) {
      if (now - lastDraw < 200 && received < total) return;
      lastDraw = now;
      const rate = received / Math.max(0.001, (now - started) / 1000), left = (total - received) / Math.max(1, rate);
      status(`Downloading character data: ${percent}% of ${megabytes(total)} - ${megabytes(rate)}/s${received < total ? ` - about ${left < 90 ? `${Math.ceil(left)} s` : `${Math.ceil(left / 60)} min`} left` : ''}`);
    } else if (percent !== lastPercent && percent % 25 === 0) { console.error(`  ${percent}%`);lastPercent = percent; }
  };
}
