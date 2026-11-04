/** Timed film typography. Drawn into the clean output, so preview, stills and video agree. */
export const TEXT_STYLES = ['subtitle', 'text', 'speech', 'thought', 'shout'] as const;
export const TEXT_LABELS = { subtitle: 'Subtitle', text: 'Plain text', speech: 'Speech bubble', thought: 'Thought bubble', shout: 'Comic burst' };
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
      size: number('size',14,72,28), color: color('color',c.style==='subtitle'||c.style==='text'?'#ffffff':'#141414'), background: color('background',c.style==='subtitle'?'#151820':c.style==='shout'?'#ffe584':'#ffffff') };
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
