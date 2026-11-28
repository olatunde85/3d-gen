# Ara Educate

Educate makes lesson videos. You write the steps (what to write on the board, what to show on the screen and what to say), and an Ara teacher writes them out, points at them and explains them, in a classroom or another room. A lesson runs for up to 10 minutes and exports as an MP4 with sound. Go to `/educate/` on [ara3dgen.com](https://ara3dgen.com/educate/). It's free, it runs in your browser, and there's no account to make lessons.

## Start a lesson

The first time you open Educate, **Start a lesson** offers ready-made lessons to start from, or a blank one. **New** in the top bar opens it again; choosing a lesson there replaces the one that's open, so **Save it first** if you want to keep a copy.

| Lesson | Subject | What it shows |
|---|---|---|
| Ara 3D Gen in five minutes | Masterclass | Ara's apps, bringing your own work, Ara for developers and making lessons: writing, slides, a terminal and code changes, about five minutes |
| Solving for x | Maths | An equation solved one step at a time on a whiteboard, circled and checked |
| Straight-line graphs | Maths | What m and c mean in y = mx + c, with a line drawn on axes |
| Newton's laws of motion | Science | The three laws on a slide, then force worked out on a chalkboard |
| Your first Python function | Coding | Code typed out, run in a terminal, changed, and a common mistake fixed |
| Writing a strong paragraph | English | The PEEL shape for a paragraph, with an example on a slide |

Change anything: the steps, the words, the teacher, the room. Your lesson is kept in this browser as you work.

## Steps

A lesson is a list of steps, played in order. **＋ Add a step** adds one after the open step; click a step to open it, and use the arrows to move it, **Duplicate** or **Delete**.

| Step | What happens |
|---|---|
| **Write** | The teacher handwrites words or a formula on the board, in an ink colour of your choice |
| **Mark** | Underline, circle, box, tick or cross the writing before it, draw a line or arrow, or plot a graph (`2*x+1`, `sin(x)`) on axes |
| **Say** | The teacher talks to the class |
| **Code** | Code types out in an editor on the screen, with its colours. Highlight lines, show a mistake underlined with the editor's message and its fix, or show it as a change to the code before |
| **Terminal** | Commands type out and their output appears. Lines starting with `$ ` are commands |
| **Image** | A diagram or photo, zoomed into, highlighted and zoomed back out |
| **Slide** | A title and points, revealed one by one |
| **Point** | The teacher points at what was just written |
| **Wipe** | The board is wiped clean |

Every step has **The teacher says, meanwhile**: the words spoken while it happens. Write them as they're said aloud ("two x plus three", not "2x + 3"). **Pause after** adds a wait. Steps are timed for you: each lasts as long as its writing or its words, whichever is longer.

The **ⓘ** beside a field explains it. **Highlight lines** takes line numbers: `2` for one line, `2-3` for a run, commas for more (`2-3, 5`). **Mistake on line** underlines that line with what the editor says, and **The line, fixed** retypes it correctly a moment later.

**Show as a change to the code before** turns a code step into a change: it starts from the code before (the last code step's, at first, so code already on the screen stays put), marks the lines taken out in red and folds them away, then opens the new lines in green and types them in.

## Where things go

Writing goes down the board's left half, then its right; a **Wipe** starts again at the top. The first writing is the largest, as the lesson's heading, and a long line is written smaller so it fits. When the board is full, the note under the preview says which step goes over earlier writing and where to add a Wipe.

Slides, code, terminals and images go on a projector screen that rolls down when a step needs it, while the teacher walks over, and rolls back up when they return to the board. A screen shows one thing at a time: a new slide or new code replaces what was there, and a terminal joins the code above it. Long code is shown smaller so all of it fits. Choose **On the board** for an image to put it on the board instead.

The camera follows the lesson: the room while the teacher moves, the teacher and the board while they write, the screen while it shows something, and the teacher when they talk. Drag the preview to turn the camera and scroll to zoom; your view is added to every shot. **Reset camera** puts it back.

## Preferences

- **Where:** Classroom, Laboratory, Studio (plain), Office or Home library.
- **Writing board:** a whiteboard or a chalkboard.
- **Handwriting:** Kalam, Caveat or Patrick Hand (fonts under the SIL Open Font Licence).
- **Teacher:** any Ara preset. Lessons leave off weapons, carried items and sunglasses.
- **Voice:** a free voice, or a voice from your own AI account (below). A free voice follows the teacher you choose.
- **Captions:** show what the teacher says on screen.

## Voices

Free voices (F1, F2, M1 and M2) are made here in your browser, automatically, as you write. The first time, Educate downloads them once (about 130 MB). The chip in the top bar shows how far it has got.

Voices from your own Gemini or ElevenLabs account use your key and your allowance, so they're never made automatically: choose **Make voices**, or they're made when you export. Connect a key with **Connect AI voices…** in the voice list; see [Your own AI and voices](keys.md). Keys stay in your browser.

Once its lines are voiced, a lesson is timed to their real length. The teacher's mouth follows the voice, while they talk, write and point; before a line is voiced, it follows the words.

## Images

An **Image** step asks for a picture: PNG, JPEG, WebP, GIF or SVG, up to 30 MB (a very large picture is scaled down to 2048 pixels on its longest side). Images are kept in this browser, and a saved lesson file carries them inside it.

In the open step, drag across the picture to mark a region, then choose **Zoom** or **Highlight**. **Zoom back out** shows all of it again. The actions play in order while the teacher talks; **Shown** chooses the screen or the board.

## Export

**Export video** makes an MP4 at 720p or 1080p, with the teacher's voice and captions if they're on. Every frame is made in your browser. Lines not voiced yet are voiced first. A lesson longer than two minutes asks where to save the file first, and is written into it as it's made; a shorter one downloads when it's ready.

## Assist

**Assist** writes a lesson from a description, such as "a 3-minute lesson for 12-year-olds on photosynthesis". Tick **Start from my current lesson** to revise the open one instead.

- **Use any AI chat:** copy the guide into ChatGPT, Claude, Gemini or another assistant, then paste its whole reply back.
- **Your own key:** connect a key (Gemini has a free allowance) and Assist writes the lesson right there, checks it and asks the assistant to fix anything Educate can't use.

Before you build, Assist checks the lesson and lists anything **worth a look**: writing that goes over earlier writing, writing too long for the board, busy slides, long speeches, steps where the teacher says nothing. **Copy fix request** asks the assistant to sort them out. Assistants can get facts wrong, so check facts, figures and spelling before you share a lesson. **Build lesson** replaces the open lesson; save first to keep a copy.

**Ask Ara**, in the corner, is a chat with your own AI that knows Educate and the lesson that's open. Ask how to do something, or ask it to write a lesson or change this one ("add a check question before the recap"); what it writes goes through the same checks, and its card offers to build it, with Undo.

## Save and open

**Save** downloads the lesson as `.ara-lesson.json`, with its images. **Open** opens one, from Educate, a colleague or an AI assistant. A link to `ara3dgen.com/educate/#lesson=…` opens the lesson it carries.

## For developers

### Lesson files

A lesson is a JSON file (`.ara-lesson.json`, `"kind": "ara-lesson"`, `"version": 1`): the room, the board, the teacher, the voice, and the steps, each with `type`, what the teacher says (`say`) and the step's own fields. Educate times the steps, lays the writing out and places the teacher; leave out positions and sizes unless you need them.

```json
{
  "$schema": "https://ara3dgen.com/schemas/educate-lesson.v1.json",
  "kind": "ara-lesson", "version": 1, "title": "Solving for x",
  "set": "classroom", "board": { "kind": "whiteboard", "font": "kalam" },
  "teacher": { "preset": "The Doctor" }, "voice": "M1", "captions": true, "aspect": "landscape",
  "steps": [
    { "type": "write", "text": "2x + 3 = 11", "say": "Here is our equation: two x plus three equals eleven." },
    { "type": "shape", "shape": "underline" },
    { "type": "write", "text": "x = 4", "say": "Take three away, divide by two, and x is four." },
    { "type": "shape", "shape": "circle" },
    { "type": "code", "lang": "python", "fileName": "solve.py", "text": "x = (11 - 3) / 2\nprint(x)", "say": "Or let Python do it." },
    { "type": "terminal", "text": "$ python solve.py\n4.0", "say": "Four." }
  ]
}
```

The schema is published at [ara3dgen.com/schemas/educate-lesson.v1.json](https://ara3dgen.com/schemas/educate-lesson.v1.json), and `ara3d schema lesson` prints it ([Command line](cli.md)). Editors such as VS Code read the `$schema` line and offer every field as you type. Educate checks more when it opens a lesson, such as a graph's formula and the 10-minute limit, and names the step to fix.

### AI assistants

With the [ara3d MCP server](mcp.md), assistants such as Claude, Cursor and VS Code write lessons: `lesson_guide` gives them the format, the steps and how to teach well, and `create_lesson` checks the lesson as Educate does, lists anything worth a look, saves it and returns a link that opens it in Educate, where you hear it, change it and export the video.

### Links

`https://ara3dgen.com/educate/#lesson=<packed>` opens a lesson packed into the link (as the MCP server writes them), and `#src=<https address>` opens a lesson file hosted elsewhere (its host must allow other sites to read it). Everything after `#` stays in the browser, so a link sends nothing to ara3dgen.com. A link carries up to 512 KB: share a lesson with images as a file.

`https://ara3dgen.com/educate/#template=<id>` opens one of the ready-made lessons: `equation`, `graphs`, `newton`, `python`, `paragraph` or `masterclass`. If a lesson of your own is open in that browser, the start screen comes up first, with that lesson picked and the option to save yours.
