import { assistExample, describeAssistProject, generateAssistGuide, parseStudioInput } from './assist';
import { hasScriptedSpeech, prepareDialogue } from './audio/prepare';
import { assistPanel } from '../app/assist/panel';
import type { Catalog } from '../core/assets';
import type { StudioProject } from './project';

interface AssistEditor {
  project(): StudioProject;
  catalog(): Catalog;
  canEdit(): boolean;
  load(project: StudioProject): Promise<boolean>;
}

export function setupAssist(editor: AssistEditor) {
  const panel = assistPanel<StudioProject>({
    dialog: document.getElementById('assist-dialog') as HTMLDialogElement,
    id: 'assist', app: 'ARA STUDIO', noun: 'film',
    title: 'Describe a film. Bring it to life.',
    intro: 'Describe a scene in your own words. An AI assistant turns it into a film you can play, edit and export.',
    placeholder: 'A nine-second poolside introduction: an executive greets an adventurer, then cut to their conversation.',
    contextLabel: 'Start from my current film (to revise it)',
    guideFile: 'ara-studio-llm-guide.txt',
    guide: (brief, current) => generateAssistGuide(editor.catalog(), brief, current ? editor.project() : undefined),
    parse: json => parseStudioInput(json, editor.catalog()),
    describe: describeAssistProject,
    example: assistExample,
    prepare:{
      note:'Dialogue voices generate automatically after a valid reply is pasted or opened. First use downloads about 265 MB; generation runs on your device and can be stopped.',
      needed:hasScriptedSpeech,
      run:prepareDialogue,
      write:(project,json)=>JSON.stringify({...JSON.parse(json),audio:project.audio},null,2),
    },
    build: async project => { if (!await editor.load(project)) throw Error('The film could not be loaded. Your previous film has been kept.'); },
    canOpen: () => editor.canEdit(),
    footnote: 'Building replaces the current film. Undo brings it back, and you can keep editing and export as usual.',
  });
  document.getElementById('open-assist')!.addEventListener('click', () => void panel.open());
  return panel;
}
