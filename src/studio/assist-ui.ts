import { assistExample, assistRequest, describeAssistProject, generateAssistGuide, parseStudioInput } from './assist';
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
    starters: [
      ['Poolside hello', 'Resort pool, 10 seconds. A confident executive in a pantsuit waves as an adventurer with a backpack arrives, then they chat warmly. Wide establishing shot, then a medium on each. A speech bubble: "You made it!" Light ambient music.'],
      ['Boardroom showdown', 'Boardroom at night, 14 seconds. Two executives argue across the table: one points and shouts, the other folds their arms, then storms out. Close-ups on each face, a tense score, and a comic shout bubble on the angriest line.'],
      ['First lesson', 'Classroom, 12 seconds. A teacher stands by the whiteboard and talks to the class, then turns and points at the board. A student raises a hand. Narrator subtitle: "Day one." Gentle music.'],
      ['Movie night', 'Living room, 12 seconds. Two friends arrive, one sits down on a chair to watch TV while the other stands and laughs. Slow push-in, warm music, and a thought bubble: "Best night in weeks."'],
      ['Neon alley chase', 'Neon alley at night, 10 seconds. A hooded figure runs through the alley while a detective in a long coat follows, then stops and looks around. Orbiting camera, dramatic music, subtitle "Lost him."'],
      ['Wedding vows', 'Wedding garden, 15 seconds. A couple stands under the floral arch facing each other; one speaks the vows (spoken voice and subtitles), then both turn and wave to the guests. Wide shot, then close-ups. Romantic music.'],
      ['Rooftop toast', 'Rooftop bar at night, 10 seconds. Two old friends raise their drinks, laugh and talk against the skyline. Medium shots, upbeat lounge music, a speech bubble: "To new beginnings!"'],
      ['Street dance', 'City street at night, 10 seconds. A dancer in streetwear performs a routine while a friend cheers beside them. Slow orbiting camera, upbeat music and a title card at the start.'],
      ['News flash', 'Newsroom at night, 9 seconds. A news anchor at the desk delivers breaking news with a spoken voice (robotic radio effect optional), with subtitles. Cut from a wide shot to a close-up.'],
      ['Desert stand-off', 'Desert outpost at sunset, 12 seconds. A sheriff and a stranger face each other several metres apart, hands ready; tense silence, then the stranger turns and walks away. Wide, then close-ups. Western-style tension.'],
      ['Beach reunion', 'Sunset beach, 10 seconds. One friend walks along the sand toward another, who waves and runs to meet them. Wide shot with a slow dolly, warm music, subtitle "Ten years later…"'],
      ['Detective intro', 'Executive office, 9 seconds. A detective in a long coat walks in, stops and says "Somebody called for help?" in a speech bubble and spoken voice. A narrator subtitle sets the scene first.'],
    ],
    contextLabel: 'Start from my current film (to revise it)',
    guideFile: 'ara-studio-llm-guide.txt',
    guide: (brief, current) => generateAssistGuide(editor.catalog(), brief, current ? editor.project() : undefined),
    request: (brief, current) => assistRequest(editor.catalog(), brief, current ? editor.project() : undefined),
    parse: json => parseStudioInput(json, editor.catalog()),
    describe: describeAssistProject,
    example: assistExample,
    build: async project => { if (!await editor.load(project)) throw Error('The film could not be loaded. Your previous film has been kept.'); },
    canOpen: () => editor.canEdit(),
    footnote: 'Building replaces the current film. Undo brings it back, and you can keep editing and export as usual.',
  });
  document.getElementById('open-assist')!.addEventListener('click', () => void panel.open());
  return panel;
}
