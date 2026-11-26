/**
 * Assist for lessons: describe a lesson, and an AI assistant writes its steps (in any AI chat, or with the person's
 * own key). Ara checks the lesson, lists what to look over before building it, and opens it in the editor. Ask Ara,
 * the chat in the corner, talks it through with the person's own AI and builds what it writes through the same panel.
 * Loaded after the page is ready.
 */
import { assistPanel } from '../app/assist/panel';
import { mountAskAra } from '../app/keys/chat';
import { describeLesson, lessonGuide, parseAssistLesson } from './guide';
import { TEMPLATES } from './templates';
import { LESSON_SETS, lessonLength, type Lesson } from './lesson';

interface LessonEditor {
  lesson(): Lesson;
  open(lesson: Lesson): void;
}

let panel: ReturnType<typeof setupLessonAssist> | undefined;
/** The one Assist panel, made the first time it's needed. */
export const lessonAssist = (editor: LessonEditor) => (panel ??= setupLessonAssist(editor));

function setupLessonAssist(editor: LessonEditor) {
  return assistPanel<Lesson>({
    id: 'lesson-assist', name: 'Assist', app: 'ARA EDUCATE', noun: 'lesson',
    title: 'Describe a lesson. Get it written.',
    intro: 'Describe what to teach and who it’s for. An AI assistant writes the steps; you check them, build the lesson and change anything you like.',
    placeholder: 'A 3-minute lesson for 12-year-olds on how photosynthesis works: what a plant takes in, what it makes, and why leaves are green. End with a quick recap.',
    contextLabel: 'Start from my current lesson (to revise it)',
    guideFile: 'ara-educate-lesson-guide.txt',
    guide: (brief, current) => lessonGuide(brief, current ? editor.lesson() : undefined),
    parse: parseAssistLesson,
    describe: describeLesson,
    example: (id) => (TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === 'equation')!).lesson,
    examples: TEMPLATES.map((t) => ({ id: t.id, label: t.title })),
    build: async (lesson, progress) => { progress({ stage: 'Opening the lesson…' });editor.open(lesson); },
    snapshot: () => structuredClone(editor.lesson()),
    canOpen: () => true,
    launcher: 'open-assist',
    storageKey: 'ara.educate.assist.v1',
    notes: {
      heading: 'Worth a look before you build',
      fixLabel: 'Copy fix request',
      fix: (warnings, json) => `Revise this Ara Educate lesson to sort out these points. Keep the rest of the lesson as it is, and reply with the complete lesson JSON only.\n\n${warnings.join('\n')}\n\nCURRENT LESSON\n${json}`,
    },
    footnote: 'Building replaces the lesson that’s open. Save it first to keep a copy. Voices are made once it’s built.',
  });
}

/** Ask Ara in Educate: it knows the lesson that's open, answers how-to questions and writes or changes lessons. */
export function mountLessonAskAra(editor: LessonEditor) {
  const assist = lessonAssist(editor);
  mountAskAra({
    appName: 'Educate', noun: 'lesson', storageKey: 'ara.chat.educate.v1',
    primer: () => {
      const l = editor.lesson(), mins = Math.round(lessonLength(l) / 6) / 10;
      return `Ara Educate makes lesson videos of up to 10 minutes: an Ara teacher writes on a whiteboard or chalkboard, shows slides, code, terminals and images on a projector screen that rolls down when needed, points at things and speaks every line, then the lesson exports as an MP4 with sound. A lesson is a list of steps (Write, Mark, Say, Code, Terminal, Image, Slide, Point, Wipe), each with what the teacher says; Educate times and lays them out. The lesson open now is "${l.title}": ${l.steps.length} steps, about ${mins} minutes, in the ${LESSON_SETS[l.set]?.label ?? l.set} on a ${l.board.kind}, taught by ${(l.teacher.preset ?? 'The Doctor').replace(/^The /, '')}. In the app: the Steps tab lists the steps (+ Add a step; click one to edit it); Preferences has the place, writing board, handwriting, teacher, voice and captions; New opens the ready-made lessons; Save and Open use .ara-lesson.json files; Export video makes the MP4. Free voices are made in the browser automatically; voices from the person's Gemini or ElevenLabs key only when they choose Make voices or export. Images are added by the person (an Image step), never written by you. Lessons are things people learn from: be accurate, and say when something should be checked.`;
    },
    guide: () => lessonGuide('(See the conversation.)', editor.lesson()),
    parse: (json) => parseAssistLesson(json),
    describe: (value) => describeLesson(value as Lesson),
    apply: (json) => assist.apply(json),
    suggestions: ['Write a 3-minute lesson on how photosynthesis works', 'Add a quick check question before the recap', 'Make this lesson simpler for 10-year-olds', 'How do I show a change to some code?'],
  });
}
