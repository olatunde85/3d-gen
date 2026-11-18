import { ASSIST_EXAMPLES, ARA_VOICE_GUIDE, assistExample, describeAssistProject, generateAssistGuide, parseStudioInput } from './assist';
import { voiceGuide, voiceProvider } from '../app/keys/voices';
import { keySettings } from '../app/keys/store';
import { WAREHOUSE_BRIEF } from './examples/warehouse';
import { prepareExampleDialogue } from './audio/example';
import { hasScriptedSpeech } from './audio/prepare';
import { assistPanel, type BuildProgress } from '../app/assist/panel';
import { mountAskAra } from '../app/keys/chat';
import type { Catalog } from '../core/assets';
import type { StudioProject } from './project';
import {SETS,type SetId} from './catalog';
import {locationMapFile,allLocationMapsFile} from './spatial-maps';
import {stagingReport,type SpatialBody,type StagingReport} from './spatial-report';

interface AssistEditor {
  project(): StudioProject;
  catalog(): Catalog;
  canEdit(): boolean;
  bodies():ReadonlyMap<string,SpatialBody>;
  load(project: StudioProject, progress: (p: BuildProgress) => void): Promise<boolean>;
}

export function setupAssist(editor: AssistEditor) {
  let contextKey='',contextReport:StagingReport|undefined,voices=ARA_VOICE_GUIDE;
  const filmContext=()=>{const project=editor.project(),key=JSON.stringify(project);if(key!==contextKey){contextReport=stagingReport(project,editor.bodies());contextKey=key;}return contextReport;};
  const panel = assistPanel<StudioProject>({
    dialog: document.getElementById('assist-dialog') as HTMLDialogElement,
    id: 'assist', name: 'Assist', app: 'ARA STUDIO', noun: 'film',
    title: 'Describe a film. Bring it to life.',
    intro: 'Describe a scene in your own words. An AI assistant turns it into a film you can play, edit and export.',
    placeholder: WAREHOUSE_BRIEF,
    contextLabel: 'Start from my current film (to revise it)',
    guideFile: 'ara-studio-llm-guide.txt',
    guide: (brief, current, location) => generateAssistGuide(editor.catalog(), brief, current ? editor.project() : undefined,location as SetId|undefined,current?filmContext():undefined,voices),
    reference:{label:'Location for this film',choices:SETS.map(s=>({id:s.id,name:s.name,category:s.category,description:s.subtitle,tags:s.tags,thumbnail:import.meta.env.BASE_URL+'studio-location-thumbs/'+s.id+'.webp',preview:import.meta.env.BASE_URL+'studio-location-previews/'+s.id+'.webp'})),current:()=>editor.project().template,
      file:id=>({name:`ara-studio-${id}-map.json`,text:JSON.stringify(locationMapFile(id as SetId),null,2)}),all:{name:'ara-studio-all-location-maps.json',text:()=>JSON.stringify(allLocationMapsFile())}},
    parse: json => parseStudioInput(json, editor.catalog()),
    describe: describeAssistProject,
    picture: project => `${import.meta.env.BASE_URL}studio-location-previews/${project.template}.webp`,
    revisionContext:project=>JSON.stringify(locationMapFile(project.template)),
    example: assistExample,
    examples: ASSIST_EXAMPLES,
    prepare:{
      note:'Dialogue is voiced automatically once the film checks out. Ara’s own voices run on your device (about 265 MB the first time); Gemini and ElevenLabs voices use your key. The warehouse example includes its recorded dialogue.',
      // Provider voices use the visitor's allowance, so they're voiced automatically only when Keys allows it.
      needed:project=>hasScriptedSpeech(project)&&(keySettings().autoVoices||!project.audio.speech.some(c=>c.source==='tts'&&!!voiceProvider(c.voice))),
      // Lines in Ara's own voices need the 265 MB voice download, so Ask Ara leaves them for Sound.
      quick:project=>project.audio.speech.every(c=>c.source!=='tts'||!c.text.trim()||!!c.asset||!!voiceProvider(c.voice)),
      run:(project,options)=>prepareExampleDialogue(project,editor.catalog(),options),
      write:(project,json)=>JSON.stringify({...JSON.parse(json),audio:project.audio},null,2),
    },
    build: async (project, progress) => { if (!await editor.load(project, progress)) throw Error('The film could not be loaded. Your previous film has been kept.'); },
    snapshot: () => structuredClone(editor.project()),
    canOpen: async () => { voices = await voiceGuide().catch(() => voices); return editor.canEdit(); },
    footnote: 'Building replaces the current film. Undo brings it back. Use Check staging in the left panel to review paths with your loaded characters before exporting.',
  });
  document.getElementById('open-assist')!.addEventListener('click', () => void panel.open());
  mountAskAra({
    appName: 'Studio', noun: 'film', storageKey: 'ara.chat.studio.v1',
    primer: () => { const p = editor.project(); return `Studio directs short 3D films (up to 60 seconds) with Ara characters on ${SETS.length} locations: actions on a timeline, camera shots, dialogue with voices, music, sound effects and on-screen text, exported as MP4. The film open now is "${p.title}" at ${SETS.find(s => s.id === p.template)?.name ?? p.template}, with ${p.actors.length} character${p.actors.length === 1 ? '' : 's'} and ${p.audio.speech.length} lines of dialogue. Voices: Sound › Dialogue. Keys (your own AI and voice accounts) is under Ask Ara's model button.`; },
    guide: async () => { voices = await voiceGuide().catch(() => voices); return generateAssistGuide(editor.catalog(), '(See the conversation.)', editor.project(), editor.project().template, filmContext(), voices); },
    parse: json => parseStudioInput(json, editor.catalog()), describe: value => describeAssistProject(value as StudioProject),
    apply: json => panel.apply(json),
    suggestions: ['Write a 20-second rooftop chase with two characters', 'Add a tense conversation to this film', 'Give my characters better voices', 'How do I export a vertical video?'],
  });
  return panel;
}
