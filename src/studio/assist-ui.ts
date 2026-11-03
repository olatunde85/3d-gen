import { assistExample, generateAssistGuide, parseStudioInput, summarizeAssistProject } from './assist';
import type { StudioProject } from './project';

interface AssistEditor {
  project(): StudioProject;
  canEdit(): boolean;
  load(project: StudioProject): Promise<boolean>;
  download(blob: Blob, name: string): void;
}

export function setupAssist(editor: AssistEditor) {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = element<HTMLDialogElement>('assist-dialog');
  const brief = element<HTMLTextAreaElement>('assist-brief');
  const context = element<HTMLInputElement>('assist-context');
  const guide = element<HTMLTextAreaElement>('assist-guide');
  const draft = element<HTMLTextAreaElement>('assist-json');
  const file = element<HTMLInputElement>('assist-file');
  const status = element<HTMLElement>('assist-status');
  const create = element<HTMLButtonElement>('assist-create');
  let parsed: StudioProject | undefined, busy = false;

  function updateGuide() { guide.value = generateAssistGuide(brief.value, context.checked ? editor.project() : undefined); }
  function validate() {
    parsed = undefined;
    status.classList.remove('error');
    draft.setAttribute('aria-invalid', 'false');
    if (!draft.value.trim()) status.textContent = 'Paste the complete project JSON or open a JSON file.';
    else try {
      parsed = parseStudioInput(draft.value);
      status.textContent = summarizeAssistProject(parsed);
    } catch (error) {
      status.textContent = (error as Error).message;
      status.classList.add('error');
      draft.setAttribute('aria-invalid', 'true');
    }
    create.disabled = busy || !parsed;
  }
  function lock() {
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement>('button,textarea,input')) control.disabled = busy;
    create.disabled = busy || !parsed;
    dialog.setAttribute('aria-busy', String(busy));
  }
  element('open-assist').addEventListener('click', () => {
    if (!editor.canEdit()) return;
    updateGuide(); validate(); dialog.showModal();
  });
  element('close-assist').addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  brief.addEventListener('input', updateGuide);
  context.addEventListener('change', updateGuide);
  draft.addEventListener('input', validate);
  element('assist-copy').addEventListener('click', async () => {
    updateGuide();
    const message = element('assist-copy-status');
    try { await navigator.clipboard.writeText(guide.value); message.textContent = 'Guide copied. Paste it into your AI assistant.'; }
    catch {
      element<HTMLDetailsElement>('assist-guide-details').open = true;
      guide.focus(); guide.select(); message.textContent = 'Guide selected. Press Ctrl/Cmd+C to copy it.';
    }
  });
  element('assist-download').addEventListener('click', () => {
    updateGuide(); editor.download(new Blob([guide.value], { type: 'text/plain;charset=utf-8' }), 'ara-studio-llm-guide.txt');
  });
  element('assist-example').addEventListener('click', () => { draft.value = JSON.stringify(assistExample(), null, 2); validate(); });
  element('assist-open').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]; if (!chosen || busy) return;
    busy = true; lock();
    try {
      if (chosen.size > 100_000) throw Error('Use JSON smaller than 100 KB.');
      draft.value = await chosen.text(); validate();
    } catch (error) {
      parsed = undefined; status.textContent = (error as Error).message; status.classList.add('error');
    } finally { file.value = ''; busy = false; lock(); }
  });
  create.addEventListener('click', async () => {
    validate(); if (!parsed || busy || !editor.canEdit()) return;
    busy = true; lock(); status.textContent = 'Building the cast and preparing the scene…';
    try {
      if (await editor.load(parsed)) dialog.close();
      else { status.textContent = 'The film could not be loaded. Your previous project has been kept.'; status.classList.add('error'); }
    } catch (error) { status.textContent = (error as Error).message; status.classList.add('error'); }
    finally { busy = false; lock(); }
  });
}
