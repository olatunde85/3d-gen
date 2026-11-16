/** Share dialog: branded image of the character, editable caption, link that rebuilds it, social buttons. */
import { defaultCaption, NETWORKS, shareCard, shareLink } from '../share';
import type { Ctx } from './context';
import { $, el } from './dom';

export function shareDialog(ctx: Ctx): void {
  $('#share-btn').addEventListener('click', () => void openShare(ctx));
}

async function openShare(ctx: Ctx) {
  const { viewer } = ctx;
  await ctx.whenIdle();
  const params = ctx.store.params;
  const dlg = el('dialog', { className: 'share-modal' });
  const close = el('button', { className: 'share-close', textContent: '✕', title: 'Close' });
  const preview = el('img', { className: 'share-preview', alt: 'Share image preview' });
  const caption = el('textarea', { className: 'share-caption', rows: 3, value: defaultCaption(params.name) });
  const link = shareLink(params);
  const linkInput = el('input', { className: 'share-link', value: link, readOnly: true });
  const note = el('div', { className: 'share-note' });
  const flash = (t: string) => {
    note.textContent = t;
    note.classList.add('on');
    setTimeout(() => note.classList.remove('on'), 1800);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied`);
    } catch {
      linkInput.select();
      flash('Press Ctrl/Cmd+C to copy');
    }
  };
  const blob = await shareCard(viewer.canvasElement, viewer.characterRect(), params.name);
  const imgUrl = URL.createObjectURL(blob);
  preview.src = imgUrl;
  const fileName = `${(params.name || 'character').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'character'}-ara-3d-gen.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  const nets = el('div', { className: 'share-nets' });
  // The system share sheet (phones, Safari, Edge/Chrome on Windows) can attach the image itself.
  if (navigator.canShare?.({ files: [file] })) {
    const native = el('button', { className: 'primary share-native', textContent: '↗ Share with image…' });
    native.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], text: `${caption.value} ${link}`, title: 'Ara 3D Gen' });
      } catch {
        /* cancelled */
      }
    });
    nets.append(native);
  }
  for (const n of NETWORKS) {
    const b = el('a', { className: `share-net net-${n.id}`, textContent: n.label, target: '_blank', rel: 'noopener' });
    b.addEventListener('click', () => (b.href = n.url(caption.value, link)));
    b.href = n.url(caption.value, link);
    nets.append(b);
  }
  const download = el('a', { className: 'share-action', textContent: '⬇ Download image', href: imgUrl, download: fileName });
  const copyLink = el('button', { className: 'share-action', textContent: '🔗 Copy link' });
  copyLink.addEventListener('click', () => copy(link, 'Link'));
  const copyAll = el('button', { className: 'share-action', textContent: '📋 Copy caption + link' });
  copyAll.addEventListener('click', () => copy(`${caption.value} ${link}`, 'Caption and link'));
  // The character, live on any web page: the embed script and an <ara-character> tag that loads this share link.
  const embed = `<script type="module" src="https://cdn.jsdelivr.net/npm/ara3d@0/dist/embed.js"></script>\n<ara-character share="${link}"></ara-character>`;
  const copyEmbed = el('button', { className: 'share-action', textContent: '</> Copy embed code', title: 'Show this character, animated, on your own website' });
  copyEmbed.addEventListener('click', () => copy(embed, 'Embed code'));

  dlg.append(
    el('div', { className: 'share-head' }, el('b', { textContent: 'Share your character' }), close),
    preview,
    el('label', { className: 'share-label', textContent: 'Caption' }), caption,
    el('label', { className: 'share-label', textContent: 'Link (opens this exact character)' }), linkInput,
    nets,
    el('div', { className: 'share-actions' }, download, copyLink, copyAll, copyEmbed),
    el('div', { className: 'share-hint', textContent: 'Tip: X, Facebook and LinkedIn take the caption and link from websites, not images. Download the image to attach it to your post.' }),
    note,
  );
  const done = () => {
    dlg.close();
    dlg.remove();
    URL.revokeObjectURL(imgUrl);
  };
  close.addEventListener('click', done);
  dlg.addEventListener('click', (e) => e.target === dlg && done());
  dlg.addEventListener('cancel', done);
  document.body.append(dlg);
  dlg.showModal();
}
