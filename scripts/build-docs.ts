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
const ORDER = ['README', 'self-hosting', 'engines', 'characters', 'faces', 'animations', 'rigging', 'exporting', 'architecture'];
const files = readdirSync(DOCS).filter((f) => f.endsWith('.md'));
const slugs = files.map((f) => basename(f, '.md')).sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});
const urlOf = (slug: string) => (slug === 'README' ? `${BASE}docs/` : `${BASE}docs/${slug}/`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

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

const CSS = `
:root { --bg:#0f1116; --panel:#171c26; --line:#262d3b; --text:#e9edf4; --muted:#9aa4b5; --accent:#5b8cff; --accent-2:#9db9ff; color-scheme: dark;
  font: 17px/1.65 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(1100px 600px at 75% -10%, rgba(91,140,255,.14), transparent 60%), var(--bg); color: var(--text); }
a { color: var(--accent-2); }
.nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 24px; padding: 14px clamp(16px,4vw,48px);
  background: rgba(15,17,22,.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(38,45,59,.6); }
.brand { color: var(--text); text-decoration: none; font-weight: 700; font-size: 19px; white-space: nowrap; }
.brand span { color: var(--accent); }
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
@media (max-width: 860px) {
  .wrap { grid-template-columns: 1fr; gap: 20px; padding-top: 24px; }
  .side { position: static; display: flex; flex-wrap: wrap; gap: 4px; }
  .side .sub { display: none; }
  .side a { padding: 6px 10px; background: rgba(255,255,255,.04); }
  .nav nav { display: none; }
  .anchor { display: none; }
}`;

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
  <a class="brand" href="${BASE}"><span>Ara</span> 3D Gen</a>
  <nav><a href="${BASE}#features">Features</a><a href="${BASE}docs/" class="on">Docs</a><a href="https://github.com/olatunde85/3d-gen">GitHub</a></nav>
  <a class="btn" href="${BASE}app/">Launch app</a>
</header>
<div class="wrap">
  <aside class="side" aria-label="Documentation pages">${side}</aside>
  <article>
${p.html}
    <div class="foot"><a href="${REPO}/docs/${p.slug}.md">Edit this page on GitHub</a><a href="https://github.com/olatunde85/3d-gen/discussions">Ask a question</a></div>
  </article>
</div>
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
// Sitemap: add the docs pages.
const sitemap = join(DIST, 'sitemap.xml');
if (existsSync(sitemap)) {
  const urls = pages.map((p) => `  <url>\n    <loc>${SITE}${urlOf(p.slug).replace(BASE, '/')}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p.slug === 'README' ? '0.8' : '0.6'}</priority>\n  </url>\n`).join('');
  writeFileSync(sitemap, readFileSync(sitemap, 'utf8').replace('</urlset>', `${urls}</urlset>`));
}
console.log(`docs: ${pages.length} pages -> dist/docs/`);
