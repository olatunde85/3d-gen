/**
 * Publishes docs/*.md as static pages on the website: dist/docs/ (README.md is the index) and
 * dist/docs/<page>/. Links between docs pages become site links; links to other files in the
 * repository go to GitHub. Run after `vite build` (it's part of `npm run build`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Marked, type Tokens } from 'marked';

const ROOT = join(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const DIST = join(ROOT, 'dist');
const BASE = process.env.BASE_PATH ?? '/';
const SITE = 'https://ara3dgen.com';
const REPO = 'https://github.com/olatunde85/3d-gen/blob/main';

// Page order for the sidebar (any other .md files follow alphabetically).
const ORDER = ['README', 'self-hosting', 'engines', 'characters', 'faces', 'animations', 'packs', 'import-characters', 'rigging', 'exporting', 'studio', 'educate', 'architecture'];
const files = readdirSync(DOCS).filter((f) => f.endsWith('.md'));
const slugs = files.map((f) => basename(f, '.md')).sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});
const urlOf = (slug: string) => (slug === 'README' ? `${BASE}docs/` : `${BASE}docs/${slug}/`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Rendered heading HTML as plain text: tags removed, entities decoded (&amp; last, so "&amp;lt;" stays "&lt;"). */
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** GitHub-style heading anchors, so #links work the same on GitHub and on the site. */
const anchor = (text: string) =>
  plain(text).toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

/** Rewrite a link from a docs page: other docs pages -> site pages, repo files -> GitHub. */
function href(link: string): string {
  if (/^(https?:|mailto:|#)/.test(link)) return link;
  const [path, hash] = link.split('#');
  const tail = hash ? `#${hash}` : '';
  const m = /^(?:\.\/)?([\w-]+)\.md$/.exec(path);
  if (m && slugs.includes(m[1])) return urlOf(m[1]) + tail;
  const repoPath = path.replace(/^\.\.\//, '').replace(/^\.\//, path.startsWith('../') ? '' : 'docs/');
  if (repoPath === 'README.md' && !hash) return `${BASE}`;
  return `${REPO}/${repoPath}${tail}`;
}

function render(md: string): { html: string; title: string; headings: [string, string][] } {
  let title = '';
  const headings: [string, string][] = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1 && !title) title = plain(text);
        const id = anchor(text);
        if (depth === 2) headings.push([id, plain(text)]);
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
      },
      link({ href: h, title: t, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        const out = href(h);
        const external = /^https?:/.test(out) && !out.startsWith(SITE);
        return `<a href="${esc(out)}"${t ? ` title="${esc(t)}"` : ''}${external ? ' rel="noopener"' : ''}>${text}</a>`;
      },
    },
  });
  return { html: marked.parse(md) as string, title, headings };
}

const pages = slugs.map((slug) => ({ slug, ...render(readFileSync(join(DOCS, `${slug}.md`), 'utf8')) }));

/**
 * The search index: one entry per section (a page's opening and each of its headings), with the page, the heading,
 * the address and the section's text. The search box loads it the first time it's used.
 */
function searchIndex() {
  // Code blocks stay out (long JSON and commands crowd out the prose); inline code, such as option names, stays in.
  const text = (html: string) => plain(html.replace(/<pre>[\s\S]*?<\/pre>/g, ' ').replace(/<(?:\/p|\/li|br|\/h\d|\/td|\/th|\/pre)>/g, ' ')).replace(/\s+/g, ' ').trim();
  const entries: { p: string; h: string; u: string; t: string }[] = [];
  for (const page of pages) {
    const title = page.slug === 'README' ? 'Overview' : page.title, url = urlOf(page.slug);
    const parts = page.html.split(/(?=<h[23] id=")/);
    for (const part of parts) {
      const heading = /^<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/.exec(part);
      const body = text(heading ? part.slice(heading[0].length) : part.replace(/^<h1[^>]*>[\s\S]*?<\/h1>/, ''));
      if (!heading && !body) continue;
      entries.push({ p: title, h: heading ? text(heading[3]).replace(/^#/, '') : title, u: heading ? `${url}#${heading[2]}` : url, t: body.slice(0, 1500) });
    }
  }
  return entries;
}

const CSS = `
:root { --bg:#0f1116; --panel:#171c26; --line:#262d3b; --text:#e9edf4; --muted:#9aa4b5; --accent:#5b8cff; --accent-2:#9db9ff; color-scheme: dark;
  font: 17px/1.65 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(1100px 600px at 75% -10%, rgba(91,140,255,.14), transparent 60%), var(--bg); color: var(--text); }
a { color: var(--accent-2); }
.nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 24px; padding: 14px clamp(16px,4vw,48px);
  background: rgba(15,17,22,.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(38,45,59,.6); }
.brand { display: inline-flex; align-items: center; gap: 0.28em; color: var(--text); text-decoration: none; font-weight: 650; font-size: 19px; letter-spacing: -0.02em; white-space: nowrap; }
.brand img { margin-right: 6px; }
.brand span { color: var(--muted); }
.nav nav { display: flex; gap: 20px; margin-left: auto; }
.nav nav a { color: var(--muted); text-decoration: none; font-size: 15px; }
.nav nav a:hover, .nav nav a.on { color: var(--text); }
.btn { display: inline-block; padding: 9px 14px; border-radius: 10px; background: var(--accent); color: #fff; font: 600 14px/1 system-ui, sans-serif; text-decoration: none; white-space: nowrap; }
.wrap { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 48px; max-width: 1180px; margin: 0 auto; padding: 40px clamp(16px,4vw,48px) 80px; }
.side { position: sticky; top: 84px; align-self: start; font-size: 15px; }
.side a { display: block; padding: 7px 12px; border-radius: 8px; color: var(--muted); text-decoration: none; }
.side a:hover { color: var(--text); background: rgba(255,255,255,.04); }
.side a.on { color: var(--text); background: rgba(91,140,255,.14); }
.side .sub a { padding: 4px 12px 4px 24px; font-size: 14px; }
article { min-width: 0; max-width: 820px; }
article h1 { font-size: clamp(32px, 4.5vw, 46px); letter-spacing: -.02em; line-height: 1.1; margin: 0 0 20px; }
article h2 { font-size: 28px; letter-spacing: -.01em; margin: 48px 0 14px; padding-top: 8px; border-top: 1px solid var(--line); line-height: 1.2; }
article h3 { font-size: 20px; margin: 32px 0 10px; }
h1, h2, h3 { position: relative; scroll-margin-top: 90px; }
.anchor { position: absolute; left: -24px; color: var(--muted); text-decoration: none; opacity: 0; }
h2:hover .anchor, h3:hover .anchor { opacity: 1; }
p, ul, ol { margin: 0 0 16px; }
li { margin: 4px 0; }
code { font: 14.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 6px; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; overflow-x: auto; margin: 0 0 20px; }
pre code { background: none; padding: 0; font-size: 14px; }
table { width: 100%; border-collapse: collapse; margin: 0 0 22px; font-size: 15px; display: block; overflow-x: auto; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 600; }
.foot { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; display: flex; gap: 16px; flex-wrap: wrap; }
.search { position: relative; margin: 0 0 14px; }
.search input { width: 100%; padding: 9px 12px 9px 34px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font: 15px system-ui, sans-serif; }
.search input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.search svg { position: absolute; left: 11px; top: 11px; width: 15px; height: 15px; color: var(--muted); pointer-events: none; }
.search kbd { position: absolute; right: 9px; top: 8px; padding: 1px 7px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font: 12px/1.5 ui-monospace, Menlo, monospace; pointer-events: none; }
.search input:focus ~ kbd, .search input:not(:placeholder-shown) ~ kbd { display: none; }
.results { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; width: min(420px, calc(100vw - 32px)); max-height: min(70vh, 520px); overflow-y: auto;
  padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: #141924; box-shadow: 0 18px 48px rgba(0,0,0,.45); }
.results[hidden] { display: none; }
.side .results a { display: block; padding: 9px 10px; border-radius: 8px; color: var(--text); background: none; }
.side .results a[aria-selected="true"], .side .results a:hover { background: rgba(91,140,255,.16); }
.results b { display: block; font-weight: 600; font-size: 15px; }
.results small { display: block; color: var(--muted); font-size: 12px; margin-top: 1px; }
.results span { display: block; color: var(--muted); font-size: 13.5px; line-height: 1.45; margin-top: 3px; overflow-wrap: anywhere; }
.results mark { background: rgba(91,140,255,.3); color: var(--text); border-radius: 3px; padding: 0 1px; }
.results p { margin: 0; padding: 10px; color: var(--muted); font-size: 14px; }
@media (max-width: 860px) {
  .search { width: 100%; }
  .wrap { grid-template-columns: 1fr; gap: 20px; padding-top: 24px; }
  .side { position: static; display: flex; flex-wrap: wrap; gap: 4px; }
  .side .sub { display: none; }
  .side a { padding: 6px 10px; background: rgba(255,255,255,.04); }
  .nav nav { display: none; }
  .anchor { display: none; }
}`;

/** The search box: matches every word typed (or the start of it) in headings, page names and text, best first. */
const SEARCH_SCRIPT = `(() => {
  const box = document.getElementById('docs-search'), list = document.getElementById('docs-results');
  let index, results = [], active = 0;
  const load = () => index ??= fetch('${BASE}docs/search.json').then((r) => r.json()).then((all) => all.map((e) => ({ ...e, lh: e.h.toLowerCase(), lp: e.p.toLowerCase(), lt: e.t.toLowerCase() })));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mark = (s, words) => esc(s).replace(new RegExp('(' + words.map((w) => esc(w).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')).join('|') + ')', 'gi'), '<mark>$1</mark>');
  function excerpt(e, words) {
    const at = Math.max(0, Math.min(...words.map((w) => { const i = e.lt.indexOf(w); return i < 0 ? Infinity : i; })));
    if (!isFinite(at)) return e.t.slice(0, 120);
    const from = Math.max(0, e.t.lastIndexOf(' ', at - 40) + 1);
    return (from ? '… ' : '') + e.t.slice(from, from + 140) + (from + 140 < e.t.length ? ' …' : '');
  }
  function score(e, words, phrase) {
    let s = e.lh.includes(phrase) ? 20 : 0;
    for (const w of words) {
      const h = e.lh.includes(w), p = e.lp.includes(w), t = e.lt.includes(w);
      if (!h && !p && !t) return 0;
      s += (h ? 8 : 0) + (p ? 3 : 0) + (t ? 1 + Math.min(1, (e.lt.split(w).length - 2) * 0.25) : 0);
    }
    return s;
  }
  function show() {
    list.hidden = !box.value.trim();box.setAttribute('aria-expanded', String(!list.hidden));
    list.innerHTML = results.length ? results.map((r, i) => '<a role="option" href="' + r.e.u + '" aria-selected="' + (i === active) + '"><b>' + mark(r.e.h, r.words) + '</b>' + (r.e.h !== r.e.p ? '<small>' + esc(r.e.p) + '</small>' : '') + '<span>' + mark(r.x, r.words) + '</span></a>').join('')
      : '<p>No results for “' + esc(box.value.trim()) + '”.</p>';
  }
  async function search() {
    const query = box.value.trim().toLowerCase(), words = query.split(/\\s+/).filter(Boolean);
    if (!words.length) { results = [];show();return; }
    const all = await load();
    if (box.value.trim().toLowerCase() !== query) return;
    results = all.map((e) => ({ e, s: score(e, words, query), words })).filter((r) => r.s).sort((a, b) => b.s - a.s).slice(0, 8).map((r) => ({ ...r, x: excerpt(r.e, words) }));
    active = 0;show();
  }
  box.addEventListener('input', search);
  box.addEventListener('focus', () => { load();if (box.value.trim()) search(); });
  box.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault();if (results.length) { active = (active + (ev.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;show();list.children[active]?.scrollIntoView({ block: 'nearest' }); } }
    else if (ev.key === 'Enter' && results[active]) { ev.preventDefault();location.href = results[active].e.u;list.hidden = true; }
    else if (ev.key === 'Escape') { box.value = '';results = [];show();box.blur(); }
  });
  // Clicking a result works before the box loses focus; clicking elsewhere closes the list.
  list.addEventListener('mousedown', (ev) => ev.preventDefault());
  list.addEventListener('click', () => { list.hidden = true;box.blur(); });
  box.addEventListener('blur', () => { list.hidden = true;box.setAttribute('aria-expanded', 'false'); });
  document.addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
    if (ev.key === '/' && !typing && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault();box.focus(); }
  });
})();`;

function page(p: (typeof pages)[number]): string {
  const side = pages
    .map((q) => {
      const on = q.slug === p.slug;
      const label = q.slug === 'README' ? 'Overview' : q.title;
      const sub = on && p.headings.length ? `<div class="sub">${p.headings.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</div>` : '';
      return `<a href="${urlOf(q.slug)}"${on ? ' class="on" aria-current="page"' : ''}>${esc(label)}</a>${sub}`;
    })
    .join('');
  const title = p.slug === 'README' ? 'Documentation: Ara 3D Gen' : `${p.title}: Ara 3D Gen docs`;
  const desc = plain(p.html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/\s+/g, ' ').slice(0, 155);
  const canonical = `${SITE}${urlOf(p.slug).replace(BASE, '/')}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" href="${BASE}favicon.ico" sizes="48x48" />
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/og.jpg" />
<meta name="theme-color" content="#0f1116" />
<style>${CSS}</style>
</head>
<body>
<header class="nav">
  <a class="brand" href="${BASE}"><img src="${BASE}logo.svg" alt="" width="24" height="24" />Ara <span>3D Gen</span></a>
  <nav><a href="${BASE}#features">Features</a><a href="${BASE}docs/" class="on">Docs</a><a href="https://github.com/olatunde85/3d-gen">GitHub</a></nav>
  <a class="btn" href="${BASE}app/">Open Builder</a>
</header>
<div class="wrap">
  <aside class="side" aria-label="Documentation pages">
    <div class="search" role="search">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6"/><path d="m13 13 5 5"/></svg>
      <input id="docs-search" type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false" aria-label="Search the docs" aria-controls="docs-results" aria-expanded="false" />
      <kbd>/</kbd>
      <div class="results" id="docs-results" role="listbox" hidden></div>
    </div>
    ${side}
  </aside>
  <article>
${p.html}
    <div class="foot"><a href="${REPO}/docs/${p.slug}.md">Edit this page on GitHub</a><a href="https://github.com/olatunde85/3d-gen/discussions">Ask a question</a></div>
  </article>
</div>
<script>${SEARCH_SCRIPT}</script>
</body>
</html>
`;
}

if (!existsSync(DIST)) throw new Error('dist/ not found: run vite build first');
for (const p of pages) {
  const dir = p.slug === 'README' ? join(DIST, 'docs') : join(DIST, 'docs', p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(p));
}
writeFileSync(join(DIST, 'docs', 'search.json'), JSON.stringify(searchIndex()));
// Sitemap: add the docs pages.
const sitemap = join(DIST, 'sitemap.xml');
if (existsSync(sitemap)) {
  const urls = pages.map((p) => `  <url>\n    <loc>${SITE}${urlOf(p.slug).replace(BASE, '/')}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p.slug === 'README' ? '0.8' : '0.6'}</priority>\n  </url>\n`).join('');
  writeFileSync(sitemap, readFileSync(sitemap, 'utf8').replace('</urlset>', `${urls}</urlset>`));
}
console.log(`docs: ${pages.length} pages -> dist/docs/`);
