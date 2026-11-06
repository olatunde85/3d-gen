import { assistExample, describeAssistProject, generateAssistGuide, parseStudioInput } from './assist';
import { WAREHOUSE_BRIEF } from './examples/warehouse';
import { prepareExampleDialogue } from './audio/example';
import { hasScriptedSpeech } from './audio/prepare';
import { assistPanel } from '../app/assist/panel';
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
  load(project: StudioProject): Promise<boolean>;
}

export function setupAssist(editor: AssistEditor) {
  let contextKey='',contextReport:StagingReport|undefined;
  const filmContext=()=>{const project=editor.project(),key=JSON.stringify(project);if(key!==contextKey){contextReport=stagingReport(project,editor.bodies());contextKey=key;}return contextReport;};
  const panel = assistPanel<StudioProject>({
    dialog: document.getElementById('assist-dialog') as HTMLDialogElement,
    id: 'assist', app: 'ARA STUDIO', noun: 'film',
    title: 'Describe a film. Bring it to life.',
    intro: 'Describe a scene in your own words. An AI assistant turns it into a film you can play, edit and export.',
    placeholder: WAREHOUSE_BRIEF,
    contextLabel: 'Start from my current film (to revise it)',
    guideFile: 'ara-studio-llm-guide.txt',
    guide: (brief, current, location) => generateAssistGuide(editor.catalog(), brief, current ? editor.project() : undefined,location as SetId|undefined,current?filmContext():undefined),
    reference:{label:'Location for this film',choices:SETS.map(s=>({id:s.id,name:s.name,category:s.category,description:s.subtitle,tags:s.tags,thumbnail:import.meta.env.BASE_URL+'studio-location-thumbs/'+s.id+'.webp',preview:import.meta.env.BASE_URL+'studio-location-previews/'+s.id+'.webp'})),current:()=>editor.project().template,
      file:id=>({name:`ara-studio-${id}-map.json`,text:JSON.stringify(locationMapFile(id as SetId),null,2)}),all:{name:'ara-studio-all-location-maps.json',text:()=>JSON.stringify(allLocationMapsFile())}},
    parse: json => parseStudioInput(json, editor.catalog()),
    describe: describeAssistProject,
    revisionContext:project=>JSON.stringify(locationMapFile(project.template)),
    example: assistExample,
    prepare:{
      note:'Dialogue is prepared automatically after paste or Open. New voices need about 265 MB on first use and run on your device. The built-in example includes its recorded dialogue.',
      needed:hasScriptedSpeech,
      run:(project,options)=>prepareExampleDialogue(project,editor.catalog(),options),
      write:(project,json)=>JSON.stringify({...JSON.parse(json),audio:project.audio},null,2),
    },
    build: async project => { if (!await editor.load(project)) throw Error('The film could not be loaded. Your previous film has been kept.'); },
    canOpen: () => editor.canEdit(),
    footnote: 'Building replaces the current film. Undo brings it back. Use Check staging in the left panel to review paths with your loaded characters before exporting.',
  });
  document.getElementById('open-assist')!.addEventListener('click', () => void panel.open());
  return panel;
}
