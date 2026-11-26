/**
 * A small, safe maths expression in x, for plotting on a board: numbers, x, + - * / ^, parentheses, pi and e, and the
 * functions below. It is read once into a function; nothing in it is ever run as code.
 */
const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round,
};
export const EXPRESSION_FUNCTIONS = Object.keys(FUNCTIONS);
type Node = (x: number) => number;

/** Reads an expression such as `2*sin(x) + x^2/4`. Throws with what's wrong. */
export function parseExpression(source: string): Node {
  if (source.length > 200) throw Error('Keep the expression under 200 characters.');
  const tokens = source.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-zA-Z_]+|[-+*/^(),]|\S/g) ?? [];
  let at = 0;
  const peek = () => tokens[at], take = () => tokens[at++];
  const expect = (t: string) => { if (take() !== t) throw Error(`Expected "${t}" in ${source}.`); };
  // Lowest to highest: + -, * / and implicit multiplication (2x), unary minus, ^ (right to left), atoms.
  function sum(): Node {
    let left = product();
    while (peek() === '+' || peek() === '-') { const op = take(), l = left, r = product();left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x); }
    return left;
  }
  function product(): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/') { take();const l = left, r = unary();left = t === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x); }
      else if (t !== undefined && /^[\d.a-zA-Z_(]/.test(t)) { const l = left, r = unary();left = (x) => l(x) * r(x); }
      else return left;
    }
  }
  function unary(): Node {
    if (peek() === '-') { take();const v = unary();return (x) => -v(x); }
    if (peek() === '+') { take();return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek() !== '^') return base;
    take();const exponent = unary();
    return (x) => base(x) ** exponent(x);
  }
  function atom(): Node {
    const t = take();
    if (t === undefined) throw Error(`The expression ${source} ends too early.`);
    if (/^[\d.]/.test(t)) { const n = Number(t);if (!Number.isFinite(n)) throw Error(`Can't read the number ${t}.`);return () => n; }
    if (t === '(') { const inner = sum();expect(')');return inner; }
    const name = t.toLowerCase();
    if (name === 'x') return (x) => x;
    if (name === 'pi') return () => Math.PI;
    if (name === 'e') return () => Math.E;
    const fn = FUNCTIONS[name];
    if (fn) { expect('(');const inner = sum();expect(')');return (x) => fn(inner(x)); }
    throw Error(`Unknown "${t}" in ${source}. Use x, numbers, + - * / ^, pi, e and ${EXPRESSION_FUNCTIONS.join(', ')}.`);
  }
  const node = sum();
  if (at < tokens.length) throw Error(`Unexpected "${tokens[at]}" in ${source}.`);
  return node;
}
