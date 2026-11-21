import { MUSIC_TRACKS } from './audio/tracks';
import { ASSIST_EXAMPLES, ARA_VOICE_GUIDE, assistExample, describeAssistProject, generateAssistGuide, parseStudioInput } from './assist';
import { voiceGuide, voiceProvider } from '../app/keys/voices';
import { keySettings } from '../app/keys/store';
import { WAREHOUSE_BRIEF } from './examples/warehouse';
import { prepareExampleDialogue } from './audio/example';
import { hasScriptedSpeech, hasUnmadeSound, prepareDialogue } from './audio/prepare';
import { decodeCharacter } from '../app/share';
import { assistPanel, type BuildProgress } from '../app/assist/panel';
import { mountAskAra } from '../app/keys/chat';
import { peekFilm } from '../app/keys/peek';
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
  /** Replaces the film in place (an undoable edit), without rebuilding the cast. */
  update(project: StudioProject): Promise<boolean>;
}

const SKIP = new Set(['the', 'and', 'with', 'city', 'night', 'day', 'small', 'big', 'old', 'new', 'room', 'area', 'place']);
/** Locations a message names (other than the open one), best match first: "rooftop" finds City rooftop and Rooftop bar. */
export function mentionedLocations(text: string, open: string): string[] {
  const words = new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).map(w => w.replace(/s$/, '')));
  const said = text.toLowerCase();
  return SETS.filter(s => s.id !== open).map(s => {
    const name = s.name.toLowerCase(), parts = name.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).map(w => w.replace(/s$/, '')).filter(w => w.length > 2 && !SKIP.has(w));
    return { id: s.id, score: (said.includes(name) ? 10 : 0) + parts.filter(w => words.has(w)).length };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.id);
}

/** The library track whose description best matches a music prompt ("tense spy theme" → a spy track). */
function closestTrack(prompt: string): (typeof MUSIC_TRACKS)[number]['id'] {
  const words = new Set(prompt.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const scored = MUSIC_TRACKS.filter(t => t.file).map(t => ({ id: t.id, score: (`${t.name} ${t.category} ${t.description}`.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(w => words.has(w)).length }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].id : 'adventure-trailer';
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
      needed:project=>(hasScriptedSpeech(project)||hasUnmadeSound(project))&&(keySettings().autoVoices||!hasUnmadeSound(project)&&!project.audio.speech.some(c=>c.source==='tts'&&!c.asset&&!!voiceProvider(c.voice))),
      // Lines in Ara's own voices need the 265 MB voice download, so Ask Ara leaves them for Sound.
      quick:project=>project.audio.speech.every(c=>c.source!=='tts'||!c.text.trim()||!!c.asset||!!voiceProvider(c.voice)),
      run:(project,options)=>prepareExampleDialogue(project,editor.catalog(),options),
      write:(project,json)=>JSON.stringify({...JSON.parse(json),audio:project.audio},null,2),
    },
    build: async (project, progress) => { if (!await editor.load(project, progress)) throw Error('The film could not be loaded. Your previous film has been kept.'); },
    snapshot: () => structuredClone(editor.project()),
    peek: text => peekFilm(text, id => SETS.find(s => s.id === id)?.name), launcher: 'open-assist',
    canOpen: async () => { voices = await voiceGuide().catch(() => voices); return editor.canEdit(); },
    footnote: 'Building replaces the scene that’s open (in a one-scene film, the whole film). Undo brings it back. Use Check staging in the left panel to review paths with your loaded characters before exporting.',
  });
  document.getElementById('open-assist')!.addEventListener('click', () => void panel.open());
  mountAskAra({
    appName: 'Studio', noun: 'film', storageKey: 'ara.chat.studio.v1',
    primer: () => { const p = editor.project(); return `Studio directs short 3D films with Ara characters on ${SETS.length} locations: up to five scenes, each up to 60 seconds, with actions on a timeline, camera shots, dialogue with voices, music, sound effects and on-screen text, exported as MP4. You write and revise one scene at a time: the scene open now; the user adds scenes in the Scenes row. The film open now is "${p.title}" at ${SETS.find(s => s.id === p.template)?.name ?? p.template}, with ${p.actors.length} character${p.actors.length === 1 ? '' : 's'} and ${p.audio.speech.length} lines of dialogue. Voices: Sound › Dialogue. Keys (your own AI and voice accounts) is under Ask Ara's model button.`; },
    guide: async () => { voices = await voiceGuide().catch(() => voices); return generateAssistGuide(editor.catalog(), '(See the conversation.)', editor.project(), editor.project().template, filmContext(), voices); },
    parse: json => parseStudioInput(json, editor.catalog()), describe: value => describeAssistProject(value as StudioProject),
    peek: text => peekFilm(text, id => SETS.find(s => s.id === id)?.name),
    apply: json => panel.apply(json),
    lookup: {
      describe: 'The guide has the full staging map of the location open now and a compact index of every location; full maps of other locations are attached by Ara, by location id.',
      find: text => mentionedLocations(text, editor.project().template),
      fetch: ids => { const sets = ids.map(id => SETS.find(s => s.id === id)).filter((s): s is (typeof SETS)[number] => !!s); return { names: sets.map(s => s.name), text: sets.map(s => `FULL STAGING MAP: ${s.name} (${s.id})\n${JSON.stringify(locationMapFile(s.id as SetId))}`).join('\n\n') }; },
    },
    repairs: () => {
      const p = editor.project(), unvoiced = p.audio.speech.filter(c => c.source === 'tts' && c.text.trim() && !c.asset);
      const unmade = p.audio.effects.filter(c => c.sound === 'generated' && !c.asset).length + (p.audio.music.track === 'generated' && !p.audio.music.asset ? 1 : 0);
      const fixes: { label: string; run(): Promise<string | void> }[] = [];
      if (unvoiced.length || unmade) fixes.push({ label: 'Try again', run: async () => {
        const next = await prepareDialogue(editor.project(), { signal: new AbortController().signal, progress: () => {} }).catch(error => { throw error; });
        await editor.update(next); return '';
      } });
      if (unvoiced.some(c => voiceProvider(c.voice))) fixes.push({ label: 'Use Ara’s voices', run: async () => {
        // Each speaker gets an Ara voice that suits them; their lines are then voiced in Sound (free, on this device).
        const next = structuredClone(editor.project()), people = new Map(next.actors.map((a, i) => [a.id, { i, gender: decodeCharacter(a.character, a.detail)?.gender }]));
        for (const c of next.audio.speech) if (c.source === 'tts' && !c.asset && voiceProvider(c.voice)) {
          const who = people.get(c.actor.replace(/^actor:/, '')), male = (who?.gender ?? 1) >= .5, odd = (who?.i ?? 1) % 2 === 1;
          c.voice = c.actor === 'narrator' ? 'M2' : male ? (odd ? 'M2' : 'M1') : (odd ? 'F2' : 'F1'); delete c.delivery;
        }
        await editor.update(next);
        document.getElementById('open-sound')?.click();
        window.setTimeout(() => (document.getElementById('sound-generate-all') as HTMLButtonElement | null)?.click(), 400);
        return 'Switched to Ara’s voices and voicing the lines in Sound (free, on this device; the first time downloads about 265 MB).';
      } });
      if (unmade) fixes.push({ label: 'Use library audio instead', run: async () => {
        const next = structuredClone(editor.project());
        next.audio.effects = next.audio.effects.filter(c => c.sound !== 'generated' || !!c.asset);
        if (next.audio.music.track === 'generated' && !next.audio.music.asset) { next.audio.music = { ...next.audio.music, track: closestTrack(next.audio.music.prompt ?? '') }; delete next.audio.music.prompt; delete next.audio.music.instrumental; }
        await editor.update(next); return 'Removed the sounds that weren’t made and chose library music. Change it in Sound › Music.';
      } });
      return fixes;
    },
    suggestions: ['Write a 20-second rooftop chase with two characters', 'Add a tense conversation to this film', 'Give my characters better voices', 'How do I export a vertical video?'],
  });
  return panel;
}
