/**
 * The JSON schema of an Ara Educate lesson file (.ara-lesson.json; published at /schemas/educate-lesson.v1.json), from
 * the same lists Educate checks lessons by. Educate checks more when it opens a lesson (a graph's formula, how long the
 * lesson runs); the schema catches the shape and the names.
 */
import { PRESETS } from '../core/params';
import { BOARD_FONTS, SHAPES } from '../studio/board';
import { CODE_LANGUAGES } from '../studio/code';
import { LESSON_SETS, MAX_STEPS, WRITING_BOARDS } from './lesson';

export function lessonSchema() {
  const text = (max: number, description?: string) => ({ type: 'string', maxLength: max, ...(description ? { description } : {}) });
  const point = { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', minimum: 0, maximum: 1 }, description: '[across, down], 0 to 1 of the board.' };
  const region = { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 1 }, description: '[x, y, width, height], 0 to 1 of the image.' };
  const line = { type: 'integer', minimum: 1, maximum: 40 };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Ara Educate lesson, version 1',
    description: 'A lesson for Ara Educate: a teacher, a writing board, and steps in order (write, mark, show on the projector screen, point, talk), each with what the teacher says. Educate times it, lays it out and films it.',
    type: 'object', required: ['kind', 'version', 'steps'], additionalProperties: false,
    properties: {
      $schema: { type: 'string', description: 'This schema\'s address, so editors check the file as you type.' },
      kind: { const: 'ara-lesson' }, version: { const: 1 },
      title: text(80),
      set: { enum: Object.keys(LESSON_SETS), default: 'classroom', description: 'Where the lesson happens.' },
      board: { type: 'object', additionalProperties: false, description: 'The board the teacher writes on. Slides, code and terminals go on a projector screen that comes down for them.', properties: {
        kind: { enum: [...WRITING_BOARDS], default: 'whiteboard' },
        font: { enum: Object.keys(BOARD_FONTS), default: 'kalam', description: 'The handwriting ("sans" is plain type).' },
      } },
      teacher: { type: 'object', additionalProperties: false, properties: {
        preset: { enum: Object.keys(PRESETS), default: 'The Doctor', description: 'An Ara character preset. Carried items, weapons and sunglasses are left off for lessons.' },
        character: { type: 'string', description: 'A character code from the Ara builder (its share link\'s code), instead of a preset.' },
      } },
      voice: { type: 'string', default: 'M1', description: 'F1 or F2 (a woman\'s voice), M1 or M2 (a man\'s), made free in the browser; or a provider voice such as gemini/Kore, made with the person\'s own key.' },
      captions: { type: 'boolean', default: true, description: 'Show what the teacher says as captions.' },
      aspect: { enum: ['landscape', 'portrait'], default: 'landscape' },
      view: { type: 'object', additionalProperties: false, description: 'A turn of the camera added to every shot.', properties: { azimuth: { type: 'number', minimum: -180, maximum: 180 }, elevation: { type: 'number', minimum: -30, maximum: 50 }, zoom: { type: 'number', minimum: 0.5, maximum: 2.5 } } },
      images: { type: 'object', description: 'The images image steps use, by ID, as data: URLs (PNG, JPEG or WebP). Educate writes these when it saves a lesson.', additionalProperties: { type: 'string', pattern: '^data:image/(png|jpeg|webp);base64,' } },
      steps: { type: 'array', minItems: 1, maxItems: MAX_STEPS, items: {
        type: 'object', required: ['type'], additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,40}$' },
          type: { enum: ['write', 'shape', 'slide', 'code', 'terminal', 'image', 'clear', 'point', 'talk'] },
          say: text(600, 'What the teacher says during the step, written as it\'s said aloud.'),
          pause: { type: 'number', minimum: 0, maximum: 10, description: 'Seconds to wait after the step (default 0.4).' },
          text: text(6000, 'write: the handwriting (short lines, \\n between them); code: the code; terminal: lines, commands starting with "$ ".'),
          size: { type: 'number', minimum: 24, maximum: 160, description: 'write: the writing\'s size (left out, it\'s sized to read well and fit).' },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'write or shape: the ink.' },
          shape: { enum: [...SHAPES], description: 'shape: underline, circle, box, tick and cross mark the writing before it; line and arrow go from/to; axes and graph draw a plot.' },
          from: point, to: point,
          fn: text(200, 'graph: a formula in x, such as 2*x+1 or sin(x).'),
          range: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' }, description: 'graph: [xMin, xMax, yMin, yMax].' },
          title: text(120, 'slide: its title.'),
          bullets: { type: 'array', maxItems: 8, items: text(160), description: 'slide: its points, shown one by one.' },
          lang: { enum: [...CODE_LANGUAGES], description: 'code: the language, for its colours.' },
          fileName: text(60, 'code: the name on the editor\'s tab.'),
          highlights: { type: 'array', maxItems: 40, items: { type: 'object', required: ['from'], additionalProperties: false, properties: { from: line, to: line, at: { type: 'number', minimum: 0, description: 'Seconds after the code is typed.' } } } },
          errors: { type: 'array', maxItems: 40, items: { type: 'object', required: ['line'], additionalProperties: false, properties: { line, message: text(80), fix: text(200, 'The line, corrected: retyped a moment later.') } } },
          before: text(6000, 'code: the code before a change; the step then shows the change to its text.'),
          image: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$', description: 'image: the image\'s ID (in images).' },
          on: { enum: ['board', 'projector'], description: 'image: where it shows (the projector screen unless "board").' },
          focus: { type: 'array', maxItems: 12, items: { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { enum: ['zoom', 'highlight', 'all'] }, region } }, description: 'image: zooms and highlights, in order; "all" zooms back out.' },
          x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
        },
      } },
    },
  };
}
