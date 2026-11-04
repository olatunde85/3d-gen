/** Lightweight CSS illustrations: no model loads, film edits or autoplay audio. */
import type { TourDemo } from './tour-content';
const person=(extra='')=>`<span class="tour-person ${extra}"><i class="tour-head"></i><i class="tour-body"></i><i class="tour-arm"></i><i class="tour-legs"></i></span>`;
const cursor='<span class="tour-cursor"><svg viewBox="0 0 24 28"><path d="M3 2v21l6-6 4 9 4-2-4-8h8Z"/></svg></span>';
const world=`<span class="tour-floor"></span><span class="tour-crate one"></span><span class="tour-crate two"></span>${person()}`;
export function tourDemo(demo:TourDemo):string {
  switch(demo){
    case 'welcome': return `<div class="tour-mini-world">${world}</div><span class="tour-demo-play">▶</span>`;
    case 'sets': return '<span class="tour-set beach">Beach</span><span class="tour-set office">Office</span><span class="tour-set pool">Pool</span>'+cursor;
    case 'cast': return person('one')+person('two')+person('three')+'<span class="tour-selection-ring"></span><span class="tour-demo-label">Your cast · up to 5</span>';
    case 'drag': return '<span class="tour-drag-path"></span>'+person()+cursor+'<span class="tour-demo-label">Select → drag → place</span>';
    case 'move': return '<span class="tour-floor"></span>'+person()+'<span class="tour-arrow left">←</span><span class="tour-arrow right">→</span><span class="tour-arrow up">↑</span><span class="tour-arrow down">↓</span>';
    case 'pose': return '<span class="tour-floor"></span>'+person()+'<span class="tour-turn-arrow">↻</span><span class="tour-lift-arrow">↕</span><span class="tour-demo-label">Turn · raise · lower</span>';
    case 'orbit': return `<div class="tour-mini-world">${world}</div>${cursor}<span class="tour-demo-label">Deselect, then orbit</span>`;
    case 'timeline': return '<div class="tour-demo-lanes"><div><b>CAMERA</b><i>Wide</i><i>Close</i><i>Wide</i></div><div><b>ACTOR</b><i>Walk</i><i>Talk</i><i>Wave</i></div><span class="tour-demo-playhead"></span></div>'+cursor;
    case 'camera': return person('one')+person('two')+'<span class="tour-viewfinder"></span><span class="tour-demo-label">Full body → medium → close</span>';
    case 'sound': return person()+'<span class="tour-bubble">Hello!</span><span class="tour-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="tour-demo-label">Dialogue · music · effects · text</span>';
    case 'assist': return '<span class="tour-code">{<br>&nbsp;"actors": [ … ],<br>&nbsp;"shots": [ … ]<br>}</span><span class="tour-json-arrow">→</span><span class="tour-json-film">▶<small>Your film</small></span>';
    case 'export': return '<div class="tour-demo-film"><span>▶</span><b>MP4</b><i></i></div><span class="tour-export-check">✓</span><span class="tour-demo-label">From your set to the screen</span>';
  }
}
