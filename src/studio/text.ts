/** Timed film typography. Drawn into the clean output, so preview, stills and video agree. */
export const TEXT_STYLES = ['subtitle', 'text', 'caption', 'title', 'speech', 'thought', 'shout'] as const;
export const TEXT_LABELS = { subtitle: 'Subtitle', text: 'Plain text', caption: 'Caption band', title: 'Title card', speech: 'Speech bubble', thought: 'Thought bubble', shout: 'Comic burst' };
export const MAX_TEXT_SIZE = 144;
/** The colours a style starts with: text, then background (the accent bar of captions and titles). */
export const textColours = (style: typeof TEXT_STYLES[number]) => ({
  color: ['subtitle', 'text', 'caption', 'title'].includes(style) ? '#ffffff' : '#141414',
  background: style === 'subtitle' ? '#151820' : style === 'shout' ? '#ffe584' : style === 'caption' || style === 'title' ? '#6d8dff' : '#ffffff',
});
export const MAX_TEXT_CUES = 64;
// Older films may contain an actor literally named screen; keep those projects importable.
export const textActorAnchor=(id:string)=>id==='screen'?'actor:screen':id;
export const resolveTextActor=(anchor:string)=>anchor==='actor:screen'?'screen':anchor;
export interface TextCue {
  id: string; text: string; start: number; duration: number; style: typeof TEXT_STYLES[number];
  anchor: string; x: number; y: number; size: number; color: string; background: string;
}
export function parseTextCues(raw: unknown, actors: Set<string>): TextCue[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TEXT_CUES) throw Error(`Use at most ${MAX_TEXT_CUES} text cues.`);
  const ids = new Set<string>();
  return raw.map((value, i) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid text cue ${i + 1}.`);
    const c = value as Record<string, unknown>, label = `Text ${i + 1}`;
    const allowed = ['id','text','start','duration','style','anchor','x','y','size','color','background'];
    for (const key of Object.keys(c)) if (!allowed.includes(key)) throw Error(`${label}: unsupported field ${key}.`);
    const id = c.id === undefined ? `text-${i}` : c.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(id) || ids.has(id)) throw Error('Text IDs must be unique.');
    ids.add(id);
    if (typeof c.text !== 'string' || c.text.length > 500 || c.text.split('\n').length > 12) throw Error(`${label}: use up to 500 characters and 12 lines.`);
    if (!TEXT_STYLES.includes(c.style as never)) throw Error(`${label}: choose an available text style.`);
    if (typeof c.anchor !== 'string' || c.anchor !== 'screen' && !actors.has(resolveTextActor(c.anchor))) throw Error(`${label}: attach to the screen or an existing character.`);
    const number = (key: string, min: number, max: number, fallback?: number) => {
      const n = c[key] ?? fallback;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw Error(`${label}: invalid ${key} (${min}–${max}).`);
      return n;
    };
    const start = number('start',0,59.9), duration = number('duration',.1,60);
    if (start + duration > 60 + 1e-7) throw Error(`${label}: finish within 60 seconds.`);
    const color = (key: string, fallback: string) => { const v = c[key] ?? fallback; if (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v)) throw Error(`${label}: ${key} needs a #RRGGBB colour.`); return v; };
    return { id, text: c.text, start, duration, style: c.style as TextCue['style'], anchor: c.anchor,
      x: number('x',c.anchor==='screen'?0:-1,1,c.anchor==='screen'?.5:0), y: number('y',c.anchor==='screen'?0:-1,1,c.anchor==='screen'?.9:-.12),
      size: number('size',14,MAX_TEXT_SIZE,28), color: color('color',textColours(c.style as TextCue['style']).color), background: color('background',textColours(c.style as TextCue['style']).background) };
  });
}
export interface TextAnchor { x: number; y: number }
export interface TextLayout { id: string; x: number; y: number; width: number; height: number; anchor?: TextAnchor }
const clamp = (v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line+' '+word : word;
      if (ctx.measureText(candidate).width <= maxWidth) { line=candidate;continue; }
      if(line)lines.push(line);line='';
      for(const char of Array.from(word)){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
    }
    lines.push(line);
  }
  return lines;
}
export function drawTextCues(ctx: CanvasRenderingContext2D, cues: readonly TextCue[], time: number, W: number, H: number, actorAnchor: (id:string)=>TextAnchor|undefined): TextLayout[] {
  const result: TextLayout[] = [], scale=Math.min(W,H)/720, margin=Math.min(W,H)*.035;
  for(const cue of cues){
    if(time+1e-7<cue.start||time>=cue.start+cue.duration-1e-7||!cue.text.trim())continue;
    const anchor=cue.anchor==='screen'?undefined:actorAnchor(cue.anchor);
    if(cue.anchor!=='screen'&&!anchor)continue;
    if(cue.style==='caption'||cue.style==='title'){result.push((cue.style==='caption'?drawCaption:drawTitle)(ctx,cue,time,W,H));continue;}
    ctx.save();
    const comic=['speech','thought','shout'].includes(cue.style),pad=(comic?16:10)*scale;
    const maxWidth=Math.min(W-margin*2,(comic?(W>H?.32:.8):cue.style==='subtitle'?.88:.75)*W)-pad*2;
    let font=cue.size*scale, lines:string[]=[];
    do{ctx.font=`${comic||cue.style==='text'?700:600} ${font}px system-ui, sans-serif`;lines=wrap(ctx,cue.text,maxWidth);if(lines.length*font*1.3+pad*2<=H*(cue.style==='subtitle'?.4:.7))break;font-=scale;}while(font>10*scale);
    const lineHeight=font*1.3,width=Math.min(maxWidth,Math.max(...lines.map(l=>ctx.measureText(l).width),0))+pad*2,height=lines.length*lineHeight+pad*2;
    const centreX=anchor?(anchor.x+cue.x)*W:cue.x*W,centreY=anchor?(anchor.y+cue.y)*H:cue.y*H;
    let x=clamp(centreX-width/2,margin,W-margin-width),y=clamp(centreY-height/2,margin,H-margin-height);
    // Keep simultaneous bubbles readable; their tails stay attached to the original character.
    if(comic)for(const box of result)if(x<box.x+box.width+8*scale&&x+width>box.x&&y<box.y+box.height+8*scale&&y+height>box.y){const above=box.y-height-12*scale;if(above>=margin)y=above;else if(box.y+box.height+height+12*scale<H-margin)y=box.y+box.height+12*scale;}
    const layout={id:cue.id,x,y,width,height,anchor};result.push(layout);
    ctx.lineWidth=Math.max(1.5,2.5*scale);ctx.strokeStyle='#151515';ctx.fillStyle=cue.background;
    ctx.shadowColor='rgba(0,0,0,.22)';ctx.shadowBlur=6*scale;ctx.shadowOffsetY=2*scale;
    const target=anchor?{x:anchor.x*W,y:anchor.y*H}:{x:x+width*.25,y:y+height+20*scale};
    if(cue.style==='speech'){
      const base=clamp(target.x,x+width*.2,x+width*.8),edge=target.y>y+height/2?y+height:y;
      ctx.beginPath();ctx.moveTo(base-10*scale,edge);ctx.lineTo(target.x,target.y);ctx.lineTo(base+10*scale,edge);ctx.closePath();ctx.fill();ctx.stroke();
    }else if(cue.style==='thought'){
      for(const [t,r]of [[.22,3],[.48,5]] as const){ctx.beginPath();ctx.ellipse(target.x+(x+width/2-target.x)*t,target.y+(y+height/2-target.y)*t,r*scale,r*scale,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }
    if(cue.style==='shout'){
      ctx.beginPath();for(let i=0;i<32;i++){const a=i/32*Math.PI*2,k=i%2?.94:1.06,ratio=Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a))),px=x+width/2+Math.cos(a)/ratio*(width/2+8*scale)*k,py=y+height/2+Math.sin(a)/ratio*(height/2+8*scale)*k;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();ctx.stroke();
    }else if(cue.style!=='text'){
      ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(height/2,(cue.style==='thought'?30:cue.style==='speech'?20:5)*scale));ctx.fill();if(comic)ctx.stroke();
    }
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=cue.color;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let i=0;i<lines.length;i++){
      const tx=x+width/2,ty=y+pad+lineHeight*(i+.5);
      if(cue.style==='text'){ctx.strokeStyle='rgba(0,0,0,.75)';ctx.lineWidth=3*scale;ctx.strokeText(lines[i],tx,ty);}
      ctx.fillText(lines[i],tx,ty);
    }
    ctx.restore();
  }
  return result;
}

// Captions and titles: heavy display type with an accent, eased in and out.
const DISPLAY = '"Helvetica Neue", "Arial Black", Arial, sans-serif', MONO = 'Menlo, "SF Mono", Consolas, monospace';
const smooth = (v: number) => { const t = clamp(v, 0, 1);return t * t * (3 - 2 * t); };
function setFont(ctx: CanvasRenderingContext2D, font: string, spacing = 0) {
  ctx.font = font;
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${spacing}px`;
}
/** How far into its entrance and exit a cue is (0 to 1 each), the entrance taking `rise` seconds and the exit `fall`. */
function phase(cue: TextCue, time: number, rise: number, fall: number) {
  const r = Math.min(rise, cue.duration * .3), f = Math.min(fall, cue.duration * .25), local = time - cue.start;
  return { local, enter: (delay = 0) => smooth((local - delay * r / rise) / r), exit: smooth((local - (cue.duration - f)) / f) };
}
/** A caption: a heavy uppercase headline on a dark band with an accent bar, flush with the nearer side of the frame,
 * sliding in from it and back out. Further lines are a smaller detail line under the headline. */
function drawCaption(ctx: CanvasRenderingContext2D, cue: TextCue, time: number, W: number, H: number): TextLayout {
  const scale = Math.min(W, H) / 720, [head, ...rest] = cue.text.split('\n'), detail = rest.join(' ').trim();
  const fromRight = cue.x > .5, bar = Math.max(4, cue.size * .14 * scale), inset = bar + cue.size * .55 * scale, maxWidth = W * .82 - inset * 2;
  let size = cue.size * scale, heads: string[] = [], details: string[] = [];
  for (;;) {
    setFont(ctx, `900 ${size}px ${DISPLAY}`, -size * .01);heads = wrap(ctx, head.toUpperCase(), maxWidth);
    setFont(ctx, `600 ${size * .5}px ${DISPLAY}`);details = detail ? wrap(ctx, detail, maxWidth) : [];
    if (heads.length + details.length <= 3 || size <= 14 * scale) break;
    size -= scale;
  }
  setFont(ctx, `900 ${size}px ${DISPLAY}`, -size * .01);
  const headWidth = Math.max(...heads.map((l) => ctx.measureText(l).width));
  setFont(ctx, `600 ${size * .5}px ${DISPLAY}`);
  const detailWidth = Math.max(0, ...details.map((l) => ctx.measureText(l).width));
  const pad = size * .3, headLine = size * 1.02, detailLine = size * .66, gap = details.length ? size * .12 : 0;
  const width = Math.max(headWidth, detailWidth) + inset * 2, height = pad * 2 + heads.length * headLine + gap + details.length * detailLine;
  const margin = Math.min(W, H) * .035, restX = fromRight ? W - width : 0, y = clamp(cue.y * H - height / 2, margin, H - margin - height);
  const { enter, exit } = phase(cue, time, .4, .32), slide = (1 - enter()) + exit, x = restX + (fromRight ? 1 : -1) * slide * (width + 4 * scale);
  ctx.save();
  ctx.fillStyle = 'rgba(11,7,18,.74)';ctx.fillRect(x, y, width, height);
  ctx.fillStyle = cue.background;ctx.fillRect(fromRight ? x + width - bar : x, y, bar, height);
  ctx.beginPath();ctx.rect(x, y, width, height);ctx.clip();
  // The words follow the band a beat behind, so the bar leads.
  const lag = (1 - enter(.35)) * size * .9 * (fromRight ? 1 : -1), textX = fromRight ? x + width - inset + lag : x + inset + lag;
  ctx.textAlign = fromRight ? 'right' : 'left';ctx.textBaseline = 'middle';ctx.fillStyle = cue.color;
  setFont(ctx, `900 ${size}px ${DISPLAY}`, -size * .01);
  heads.forEach((l, i) => ctx.fillText(l, textX, y + pad + headLine * (i + .5) + size * .03));
  ctx.globalAlpha = enter(.6) * .86;setFont(ctx, `600 ${size * .5}px ${DISPLAY}`);
  details.forEach((l, i) => ctx.fillText(l, textX, y + pad + heads.length * headLine + gap + detailLine * (i + .5)));
  ctx.restore();
  return { id: cue.id, x: restX, y, width, height };
}
/** A title card over the scene: a heavy headline, an accent rule under it, a tagline (the second line) and small
 * spaced lines in the accent colour (any further lines), over a soft dark glow. They rise and settle in turn, and
 * fade out together. */
function drawTitle(ctx: CanvasRenderingContext2D, cue: TextCue, time: number, W: number, H: number): TextLayout {
  const scale = Math.min(W, H) / 720, margin = Math.min(W, H) * .05, [head, tagline, ...notes] = cue.text.split('\n').map((l) => l.trim());
  const maxWidth = W - margin * 2;
  let size = cue.size * scale, heads: string[] = [];
  for (;;) { setFont(ctx, `900 ${size}px ${DISPLAY}`, -size * .02);heads = wrap(ctx, head, maxWidth);if (heads.length <= 2 || size <= 14 * scale) break;size -= scale; }
  const tagSize = Math.max(14 * scale, size * .3), noteSize = Math.max(12 * scale, size * .22);
  setFont(ctx, `700 ${tagSize}px ${DISPLAY}`);const tags = tagline ? wrap(ctx, tagline, maxWidth) : [];
  const headLine = size * 1.0, rule = Math.max(3 * scale, size * .06), ruleGap = size * .32, tagLine = tagSize * 1.3, noteLine = noteSize * 1.6;
  const height = heads.length * headLine + ruleGap * 2 + rule + tags.length * tagLine + (notes.length ? noteSize * .9 + notes.length * noteLine : 0);
  const cx = clamp(cue.x, .1, .9) * W, top = clamp(cue.y * H - height / 2, margin, H - margin - height);
  const { enter, exit } = phase(cue, time, .7, .45), fade = 1 - exit, grow = 1 + exit * .03;
  ctx.save();
  // A soft dark glow behind the words keeps them clear on any scene.
  const glow = ctx.createRadialGradient(cx, top + height / 2, 0, cx, top + height / 2, Math.max(W, H) * .58);
  glow.addColorStop(0, `rgba(8,6,14,${.72 * enter() * fade})`);glow.addColorStop(.55, `rgba(8,6,14,${.4 * enter() * fade})`);glow.addColorStop(1, 'rgba(8,6,14,0)');
  ctx.fillStyle = glow;ctx.fillRect(0, 0, W, H);
  ctx.translate(cx, top + height / 2);ctx.scale(grow, grow);ctx.translate(-cx, -(top + height / 2));
  ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.shadowColor = 'rgba(0,0,0,.45)';ctx.shadowBlur = 18 * scale;ctx.shadowOffsetY = 3 * scale;
  let y = top, widest = 0;
  const line = (text: string, lineHeight: number, at: number, colour: string, font: string, spacing = 0) => {
    const a = enter(at);ctx.globalAlpha = a * fade;ctx.fillStyle = colour;setFont(ctx, font, spacing);
    widest = Math.max(widest, ctx.measureText(text).width);
    ctx.fillText(text, cx, y + lineHeight / 2 + (1 - a) * lineHeight * .35);y += lineHeight;
  };
  const headScale = 1.06 - .06 * enter();
  ctx.save();ctx.translate(cx, top + heads.length * headLine / 2);ctx.scale(headScale, headScale);ctx.translate(-cx, -(top + heads.length * headLine / 2));
  for (const l of heads) line(l, headLine, 0, cue.color, `900 ${size}px ${DISPLAY}`, -size * .02);
  ctx.restore();
  y += ruleGap;
  const ruleWidth = Math.min(size * 1.1, widest) * enter(.3);
  ctx.globalAlpha = fade;ctx.shadowBlur = 0;ctx.fillStyle = cue.background;ctx.fillRect(cx - ruleWidth / 2, y, ruleWidth, rule);ctx.shadowBlur = 18 * scale;
  y += rule + ruleGap;
  for (const l of tags) line(l, tagLine, .4, cue.color, `700 ${tagSize}px ${DISPLAY}`);
  if (notes.length) y += noteSize * .9;
  for (const l of notes) line(l, noteLine, .6, cue.background, `500 ${noteSize}px ${MONO}`, noteSize * .04);
  ctx.restore();
  return { id: cue.id, x: clamp(cx - widest / 2 - 8 * scale, 0, W), y: top, width: Math.min(W, widest + 16 * scale), height };
}

export function parseSubtitles(source:string):TextCue[]{
  if(source.length>100_000)throw Error('Use a subtitle file smaller than 100 KB.');
  const blocks=source.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);
  const seconds=(stamp:string)=>{const m=/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(stamp);if(!m||+m[2]>59||+m[3]>59)throw Error('Use SRT timestamps in HH:MM:SS,mmm format.');return +m[1]*3600 + +m[2]*60 + +m[3]+ +m[4]/1000;};
  const cues=blocks.filter(Boolean).map((block,i)=>{
    const lines=block.split('\n');if(/^\d+$/.test(lines[0]))lines.shift();
    const times=/^(\S+)\s+-->\s+(\S+)\s*$/.exec(lines.shift()??'');if(!times)throw Error(`Subtitle ${i+1}: missing SRT timing.`);
    const start=seconds(times[1]),end=seconds(times[2]);
    return {id:`subtitle-${i}`,text:lines.join('\n').replace(/<\/?(?:i|b|u|font)(?:\s[^>]*)?>/gi,''),start,duration:Math.round((end-start)*1000)/1000,style:'subtitle',anchor:'screen',x:.5,y:.9,size:28,color:'#ffffff',background:'#151820'};
  });
  if(!cues.length)throw Error('This SRT file has no subtitles.');
  return parseTextCues(cues,new Set());
}
export function subtitlesToSrt(cues:readonly TextCue[]):string{
  const stamp=(seconds:number)=>{let ms=Math.round(seconds*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
  return cues.filter(c=>c.style==='subtitle').sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.text}`).join('\n\n')+'\n';
}
