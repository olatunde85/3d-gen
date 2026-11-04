/** Tour copy and targets follow the editor's actual controls; demonstrations never edit a film. */
export const TOUR_STORAGE_KEY = 'ara.studio.tour.v1';
export type TourDemo = 'welcome'|'sets'|'cast'|'drag'|'move'|'pose'|'orbit'|'timeline'|'camera'|'sound'|'assist'|'export';
interface TourStep {
  title:string; body:string; targets:string[]; demo:TourDemo;
  keys?:{keys:string[];label:string}[];
}
export const TOUR_STEPS:readonly TourStep[] = [
  {title:'Your set. Your cast. Your film.',demo:'welcome',targets:['#stage'],
    body:'Choose a location, direct your characters, then make a film. This quick tour points out the tools and demonstrates the gestures. Your film stays untouched.'},
  {title:'Find the right location',demo:'sets',targets:['#scene-search','#scene-category'],
    body:'Search 50 sets or choose a category, then pick a scene below. Changing location keeps your characters, actions and dialogue.'},
  {title:'Meet your cast',demo:'cast',targets:['#cast-roster','.cast-actions','#character'],
    body:'Add up to five characters. Click a name to select them, choose a preset, or open Character builder to customize their appearance. Equipment below gives the selected character a weapon or bag.'},
  {title:'Select, drag, place',demo:'drag',targets:['#film'],
    body:'Click a character: a gold ring marks your selection. Drag their body to move them. For another way to place them, use Click to place, or Shift-click the ground. Click empty background or press Escape to deselect.',
    keys:[{keys:['Esc'],label:'Deselect character'}]},
  {title:'Move a selected character',demo:'move',targets:['#blocking-settings'],
    body:'Click a character in the preview, then use the arrow keys to move them relative to your view. The placement fields on the right let you enter precise coordinates.',
    keys:[{keys:['↑','↓','←','→'],label:'Move selected character'}]},
  {title:'Turn or lift your character',demo:'pose',targets:['#blocking-settings'],
    body:'Click a character in the preview to select them. Hold Ctrl (or Command ⌘ on Mac) with Left/Right to turn, or Up/Down to raise or lower them.',
    keys:[{keys:['Ctrl / ⌘','← / →'],label:'Turn left / right'},{keys:['Ctrl / ⌘','↑ / ↓'],label:'Raise / lower'}]},
  {title:'Look around the set',demo:'orbit',targets:['#film'],
    body:'Deselect first: the arrow keys now orbit the view. Drag empty background to look around; scroll or pinch to zoom. With the preview focused, + / − zoom and Home resets the angle.',
    keys:[{keys:['Esc'],label:'Deselect first'},{keys:['↑','↓','←','→'],label:'Orbit when nothing is selected'},{keys:['+ / −','Home'],label:'Zoom / reset preview'}]},
  {title:'Direct the performance',demo:'timeline',targets:['#tracks'],
    body:'Each character has a timeline row; the camera has its own. Select an action block to search animations and change timing on the right. + Action adds a performance. Review travelling clips: walls and props do not stop characters.'},
  {title:'Choose your camera shots',demo:'camera',targets:['#add-shot'],
    body:'Add a camera shot, then select its block in the camera row. Set the subject, framing and duration on the right. The Camera section also chooses a slow push-in or orbit, and landscape or portrait.'},
  {title:'Give your film a voice',demo:'sound',targets:['#open-sound','#open-effects','#open-text'],
    body:'Sound adds typed, recorded or uploaded dialogue and music. Use Generate all speech for scripted lines. Sound effects adds timed impacts or gunshots. Text & subtitles adds captions and comic bubbles that can follow a character.'},
  {title:'Start with an idea',demo:'assist',targets:['#open-assist'],
    body:'LLM Assist gives you a guide to take to your AI assistant. Paste or open its JSON, review, then Build film. Try an example loads the five-character warehouse film, including its original voices. Undo brings your previous film back.'},
  {title:'Play, save, share',demo:'export',targets:['#save-project','#open-export'],
    body:'Preview with Space, expand with F, and undo with Ctrl/⌘ + Z while the preview is focused. Edit the title at the top. Save project keeps an editable copy and its recordings; Export film creates your MP4. Replay this tour from the left panel whenever you need it.',
    keys:[{keys:['Space'],label:'Play / pause'},{keys:['F'],label:'Expand / show editor'},{keys:['Ctrl / ⌘','Z'],label:'Undo'}]},
];
