/**
 * Ready-made lessons to start from: each a complete lesson in a different subject, showing what the steps can do.
 * Loaded only when the start screen opens.
 */
import type { Lesson, Step } from './lesson';

export interface Template {
  id: string;
  subject: string;
  title: string;
  about: string;
  lesson: Lesson;
}

type Draft = Omit<Step, 'id'>;
const lesson = (title: string, set: Lesson['set'], board: Lesson['board']['kind'], preset: string, voice: string, steps: Draft[]): Lesson => ({
  kind: 'ara-lesson', version: 1, title, set, board: { kind: board, font: 'kalam' }, teacher: { preset }, voice, captions: true, aspect: 'landscape',
  steps: steps.map((s, i) => ({ id: `s${i + 1}`, ...s })),
});

const greet = 'def greet(name):\n    return "Hello, " + name\n\nprint(greet("Ada"))';
const greetChoice = 'def greet(name, greeting="Hello"):\n    return greeting + ", " + name\n\nprint(greet("Ada"))\nprint(greet("Sam", "Welcome"))';

const embedCode = '<script type="module"\n  src="https://cdn.jsdelivr.net/npm/ara3d@0/dist/embed.js">\n</script>\n\n<ara-character preset="The Soldier"\n  animation="rifle_idle" weapon="rifle">\n</ara-character>';
const heroCode = "import { createCharacter } from 'ara3d';\n\nconst hero = await createCharacter('The Soldier');\nscene.add(hero.scene);";
const heroAnimated = "import { createCharacter } from 'ara3d';\n\nconst hero = await createCharacter('The Soldier', {\n  animations: ['walk', 'idle'],\n});\nscene.add(hero.scene);";

export const TEMPLATES: Template[] = [
  {
    id: 'masterclass', subject: 'Masterclass', title: 'Ara 3D Gen in five minutes', about: 'Ara’s apps, bringing your own work, Ara for developers, and making lessons like this one.',
    lesson: lesson('Ara 3D Gen in five minutes', 'office', 'whiteboard', 'Businesswoman', 'F2', [
      { type: 'talk', say: 'Welcome to this masterclass on Ara 3D Gen. In five minutes, you will know what it does, how its apps fit together, and how to make a lesson just like this one.' },
      { type: 'write', text: 'Ara 3D Gen', say: 'Ara 3D Gen makes realistic 3D characters, films and games. It is free, it runs in your browser, and it is open source.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: 'Ara = body', say: 'Ara is the Yoruba word for body, because everything starts with one: a character.' },
      { type: 'write', text: 'Build', say: 'There are three apps, and they share one cast of characters. First, you build.' },
      { type: 'write', text: 'Film', say: 'Then you film.' },
      { type: 'write', text: 'Play', say: 'And then you play.' },
      { type: 'point', say: 'Build it, film it, play it. A character you make in one app works in all three. Let us look at each one.' },
      { type: 'slide', title: 'The character builder', bullets: ['Shape a body: age, heritage and build', 'Dress it: outfits, hair, tattoos and props', 'Over 250 animations, from walks to dances', 'Export GLB, FBX or OBJ for any engine'], say: 'The builder is where characters are made. Shape a body, dress it, and give it hair, tattoos and props. Pick from over two hundred and fifty animations, then export it for Unity, Unreal, Godot, Blender or the web.' },
      { type: 'talk', say: 'Faces come alive too. Characters blink, glance around and show their feelings, and their lips move as they speak, just like mine.' },
      { type: 'slide', title: 'Ara 3D Studio', bullets: ['Films of up to five scenes', 'Up to five characters on 71 sets', 'Voices, subtitles, music and sound', 'Export an MP4 with sound'], say: 'Studio is where you direct. Put up to five characters on one of seventy one sets, move them and the camera, give them voices, subtitles, music and sound effects, and export a finished video.' },
      { type: 'slide', title: 'Ara Play', bullets: ['Missions, races and endless runs', 'Campaigns of up to ten chapters', 'Publish online in about a minute', 'No code, no engine, no install'], say: 'And Play is where you make games. Missions, races and endless runs, strung into a campaign of up to ten chapters, and published online in about a minute. No code, and nothing to install.' },
      { type: 'clear', say: 'Now, something that makes Ara different.' },
      { type: 'write', text: 'Bring your own', say: 'You can bring your own work into Ara.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: 'Characters', say: 'Characters from Mixamo, VRoid or Blender, and every Ara animation plays on them.' },
      { type: 'write', text: 'Animations', say: 'Your own animations, from motion capture or Blender, fitted to every character.' },
      { type: 'write', text: 'Sets', say: 'Places you model in Blender, brought into Studio in one click.' },
      { type: 'write', text: 'AI and voices', say: 'And your own AI and voice keys, which never leave your browser.' },
      { type: 'talk', say: 'No key? Assist gives you a guide to paste into any AI chat you already use, and builds whatever it writes back.' },
      { type: 'point', say: 'And whatever you make is yours. There are no accounts to make things, no credits and no limits.' },
      { type: 'talk', say: 'If you write code, Ara comes with you.' },
      { type: 'terminal', text: '$ npx ara3d export --preset "The Soldier"\nThe Soldier: building the character...\nThe Soldier: writing GLB...\nDone: 1 character, 1 file in 3.9 s', say: 'From the command line, one line exports a character, ready for a game engine. Nothing to install first.' },
      { type: 'code', lang: 'javascript', fileName: 'scene.js', text: heroCode, highlights: [{ from: 3 }], say: 'In a three js app, one call gives you a character, ready to add to your scene.' },
      { type: 'code', lang: 'javascript', fileName: 'scene.js', before: heroCode, text: heroAnimated, say: 'Ask for animations, and they come with it, walking and standing, ready to play.' },
      { type: 'code', lang: 'html', fileName: 'index.html', text: embedCode, highlights: [{ from: 5, to: 7 }], say: 'And on any web page, one tag shows a moving character, with no build step at all. Choose the preset, the animation and what they hold.' },
      { type: 'terminal', text: '$ claude mcp add ara3d -- npx -y ara3d mcp', say: 'You can even add Ara to your AI assistant, so it makes characters for you when you ask.' },
      { type: 'clear', say: 'Finally, the app that made this lesson.' },
      { type: 'write', text: 'Ara Educate', say: 'This masterclass was made in Ara Educate.' },
      { type: 'shape', shape: 'underline' },
      { type: 'slide', title: 'A lesson is a list of steps', bullets: ['Write on a whiteboard or a chalkboard', 'Mark it: underline, circle, tick or graph', 'Show slides, code, terminals and images', 'The teacher speaks every line'], say: 'You write the steps: what to write on the board, how to mark it, and what to show on the screen. The teacher writes, points and explains, and speaks every line you give them.' },
      { type: 'talk', say: 'Choose a whiteboard or a chalkboard to write on. When a step needs a slide or code, a screen rolls down for it, and rolls back up when the teacher returns to the board.' },
      { type: 'write', text: 'Up to 10 minutes', say: 'A lesson can run for up to ten minutes, and exports as a video with sound.' },
      { type: 'write', text: 'Free voices', say: 'The free voices are made right here in your browser.' },
      { type: 'shape', shape: 'tick' },
      { type: 'clear', say: 'Let us recap.' },
      { type: 'write', text: 'Recap', say: 'Here is everything, in four lines.' },
      { type: 'shape', shape: 'underline' },
      { type: 'slide', title: 'Ara 3D Gen in four lines', bullets: ['Build, film and play, with one cast', 'Bring your own characters, moves, sets and keys', 'Code with it: command line, library, one tag', 'Teach with it: lessons as steps, out as video'], say: 'Build, film and play, with one cast of characters. Bring your own characters, moves, sets and keys. Write code with it, from the command line, a library or one tag. And teach with it: lessons written as steps, exported as video.' },
      { type: 'talk', say: 'So start from a template like this one, change the steps, and make it yours. Thank you for watching, and happy making.' },
    ]),
  },
  {
    id: 'equation', subject: 'Maths', title: 'Solving for x', about: 'An equation solved one step at a time, then checked.',
    lesson: lesson('Solving for x', 'classroom', 'whiteboard', 'The Doctor', 'M1', [
      { type: 'talk', say: 'Today we will solve an equation, one step at a time. The goal is to get x on its own.' },
      { type: 'write', text: '2x + 3 = 11', say: 'Here is our equation: two x plus three equals eleven.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: '2x + 3 − 3 = 11 − 3', say: 'First, take three away from both sides, so the equation stays balanced.' },
      { type: 'write', text: '2x = 8', say: 'That leaves two x equals eight.' },
      { type: 'write', text: 'x = 8 ÷ 2', say: 'Now divide both sides by two.' },
      { type: 'write', text: 'x = 4', say: 'So x equals four.' },
      { type: 'shape', shape: 'circle', say: 'That is our answer.' },
      { type: 'write', text: 'Check: 2 × 4 + 3 = 11', say: 'Let us check it. Two times four is eight, and eight plus three is eleven.' },
      { type: 'shape', shape: 'tick', say: 'It works.' },
      { type: 'talk', say: 'Whatever you do to one side, do to the other. That is the whole trick.' },
    ]),
  },
  {
    id: 'graphs', subject: 'Maths', title: 'Straight-line graphs', about: 'What m and c mean in y = mx + c, with a line drawn on axes.',
    lesson: lesson('Straight-line graphs', 'classroom', 'whiteboard', 'Businesswoman', 'F1', [
      { type: 'write', text: 'y = mx + c', say: 'Every straight line can be written as y equals m x plus c.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: 'm = gradient', say: 'm is the gradient: how steep the line is.' },
      { type: 'write', text: 'c = where it meets y', say: 'c is where the line crosses the y axis.' },
      { type: 'write', text: 'y = 2x + 1', say: 'Let us draw y equals two x plus one.' },
      { type: 'shape', shape: 'graph', fn: '2*x+1', range: [-5, 5, -5, 5], say: 'Here it is. It crosses the y axis at one, and goes up two for every one step across.' },
      { type: 'point', say: 'A bigger m makes a steeper line. A negative m makes it slope down.' },
      { type: 'talk', say: 'So with just m and c, you can sketch any straight line.' },
    ]),
  },
  {
    id: 'newton', subject: 'Science', title: 'Newton’s laws of motion', about: 'The three laws on a slide, then force worked out on a chalkboard.',
    lesson: lesson('Newton’s laws of motion', 'laboratory', 'chalkboard', 'The Lab Scientist', 'F2', [
      { type: 'talk', say: 'Three simple laws explain almost every motion you see.' },
      { type: 'slide', title: 'Newton’s laws of motion', bullets: ['Things keep still or keep moving unless a force acts', 'Force = mass × acceleration', 'Every push has an equal push back'], say: 'First, an object keeps doing what it is doing unless a force acts on it. Second, force equals mass times acceleration. Third, every push comes with an equal push back.' },
      { type: 'write', text: 'F = m × a', say: 'The second law is the one we calculate with.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: 'm = 2 kg', say: 'Say a trolley has a mass of two kilograms,' },
      { type: 'write', text: 'a = 3 m/s²', say: 'and it speeds up by three metres per second, every second.' },
      { type: 'write', text: 'F = 2 × 3 = 6 N', say: 'The force is two times three: six newtons.' },
      { type: 'shape', shape: 'box', say: 'Newtons are the unit of force.' },
      { type: 'talk', say: 'Double the mass, and you need double the force for the same speed-up.' },
    ]),
  },
  {
    id: 'python', subject: 'Coding', title: 'Your first Python function', about: 'Code typed out, run in a terminal, changed, and a common mistake fixed.',
    lesson: lesson('Your first Python function', 'office', 'whiteboard', 'The Corporate High-Flier', 'M2', [
      { type: 'talk', say: 'Functions let you give a piece of code a name, and use it again and again.' },
      { type: 'code', lang: 'python', fileName: 'greet.py', text: greet, highlights: [{ from: 1, to: 2 }], say: 'Here is a function called greet. It takes a name, and gives back a greeting.' },
      { type: 'terminal', text: '$ python greet.py\nHello, Ada', say: 'Run it, and it prints hello, Ada.' },
      { type: 'code', lang: 'python', fileName: 'greet.py', before: greet, text: greetChoice, highlights: [{ from: 1 }], say: 'Now let us make the greeting something you can choose. If you do not choose one, it is still hello.' },
      { type: 'terminal', text: '$ python greet.py\nHello, Ada\nWelcome, Sam', say: 'Now each call gets its own greeting.' },
      { type: 'code', lang: 'python', fileName: 'add.py', text: 'def add(a, b)\n    return a + b', errors: [{ line: 1, message: 'SyntaxError: expected \':\'', fix: 'def add(a, b):' }], say: 'And watch out for the most common mistake of all: forgetting the colon. Python stops right there.' },
      { type: 'talk', say: 'Give it a name, give it inputs, return a result. That is a function.' },
    ]),
  },
  {
    id: 'paragraph', subject: 'English', title: 'Writing a strong paragraph', about: 'The PEEL shape for a paragraph, with an example on a slide.',
    lesson: lesson('Writing a strong paragraph', 'home-library', 'whiteboard', 'The Female Executive', 'F2', [
      { type: 'talk', say: 'A strong paragraph has a simple shape. Once you know it, you can use it in any essay.' },
      { type: 'write', text: 'P E E L', say: 'Remember it as PEEL.' },
      { type: 'shape', shape: 'underline' },
      { type: 'write', text: 'Point', say: 'Start with your point: one clear sentence that says what the paragraph is about.' },
      { type: 'write', text: 'Evidence', say: 'Then give evidence: a fact, a quote or an example that backs it up.' },
      { type: 'write', text: 'Explain', say: 'Explain how your evidence proves your point. This is where most of the marks are.' },
      { type: 'shape', shape: 'circle' },
      { type: 'write', text: 'Link', say: 'Finally, link back to the question, or on to your next paragraph.' },
      { type: 'slide', title: 'An example', bullets: ['Point: a daily walk is good for you', 'Evidence: even short walks can ease stress', 'Explain: moving lifts your mood and clears your head', 'Link: so a walk is worth the time'], say: 'Here is a short example, one part at a time.' },
      { type: 'talk', say: 'Point, evidence, explain, link. Try it on your next paragraph.' },
    ]),
  },
];
