/** Sidebar: hair, tattoos, earrings, the held weapon, bags and the ride. */
import { EARRINGS, EARRING_LABELS, HAIRSTYLES, TATTOOS, TATTOO_LABELS, isProceduralHair, type EarringId, type Metal, type TattooId } from '../../core/looks';
import { ageToYears } from '../../core/params';
import { CARRIED, CARRY_LABELS, type CarryId } from '../../core/props/carry';
import { WEAPONS, WEAPON_LABELS, type WeaponId } from '../../core/props/weapons';
import type { Ctx } from './context';
import { color, none, picker, selectRow, thumb } from './controls';
import { el } from './dom';
import { styleControls } from './sidebar-clothing';
import {VEHICLE_FINISHES,VEHICLE_VARIANTS,VEHICLE_FOR_CLIP,VEHICLE_LABELS,VEHICLE_BODY_LABELS,VEHICLE_LIVERY_LABELS,bodiesFor,liveriesFor,vehicleStyleForBody,vehicleStyleForChoice,type VehicleBody,type VehicleStyle} from '../../core/props/vehicles';

export function hairPanel(ctx: Ctx) {
  const { store } = ctx;
  const tint = color(ctx, 'Hair tint', 'hairTint');
  const own = color(ctx, 'Hair colour', 'hairColor', false);
  const show = () => {
    const proc = isProceduralHair(store.params.hair);
    tint.style.display = proc || store.params.hair === 'none' ? 'none' : '';
    own.style.display = proc ? '' : 'none';
  };
  store.on('sync', show);
  show();
  const grid = picker(ctx, ctx.cat.hair, 'hair', [...none('quick-thumbs/hair-none.png'), ...HAIRSTYLES.map((h) => ({ ...h, src: thumb(`quick-thumbs/hair-${h.id}.png`) }))]);
  grid.addEventListener('click', () => requestAnimationFrame(show));
  return el('div', {}, grid, tint, own);
}

export function tattooPanel(ctx: Ctx) {
  const { store } = ctx;
  const wrap = el('div', {});
  const note = el('div', { className: 'hint' });
  const boxes: HTMLInputElement[] = [];
  for (const t of TATTOOS) {
    const box = el('input', { type: 'checkbox' });
    box.addEventListener('change', () => {
      const has = store.params.tattoos.includes(t);
      store.set({ tattoos: has ? store.params.tattoos.filter((x) => x !== t) : [...store.params.tattoos, t as TattooId] });
    });
    boxes.push(box);
    wrap.append(el('label', { className: 'acc' }, box, TATTOO_LABELS[t]));
  }
  const show = () => {
    const adult = ageToYears(store.params.age) >= 18;
    TATTOOS.forEach((t, i) => {
      boxes[i].checked = store.params.tattoos.includes(t);
      boxes[i].disabled = !adult;
    });
    note.textContent = adult ? 'Painted on the skin as a separate overlay layer, so they follow body shape and animation.' : 'Tattoos are available for adult (18+) characters only.';
  };
  store.on('sync', show);
  show();
  wrap.addEventListener('change', () => requestAnimationFrame(show));
  wrap.append(color(ctx, 'Ink colour', 'tattooInk', false), note);
  return wrap;
}

export function earringPanel(ctx: Ctx) {
  const { store } = ctx;
  return el('div', {},
    el('div', { className: 'sub', textContent: 'Earrings' }),
    selectRow(ctx, 'Earrings', EARRINGS.map((e) => [e, EARRING_LABELS[e]]), () => store.params.earrings, (v) => store.set({ earrings: v as EarringId })),
    selectRow(ctx, 'Metal', [['gold', 'Gold'], ['silver', 'Silver']], () => store.params.earringMetal, (v) => store.set({ earringMetal: v as Metal })));
}

/** Clip that shows off each weapon when it is picked. */
const WEAPON_IDLE: Partial<Record<WeaponId, string>> = { rifle: 'rifle_idle', pistol: 'pistol_idle', sword: 'sword_idle', knife: 'sword_idle', grenade:'throw_grenade' };

export function weaponPanel(ctx: Ctx) {
  const { store } = ctx;
  const row = selectRow(ctx, 'Held weapon', WEAPONS.map((w) => [w, WEAPON_LABELS[w]]), () => store.params.weapon, (v) => {
    store.set({ weapon: v as WeaponId });
    const clip = WEAPON_IDLE[v as WeaponId];
    if (clip && store.params.rig !== 'none') ctx.playClip(clip);
  });
  const note = el('div', {
    className: 'hint',
    textContent: 'Held in the right hand on a "WeaponR" socket bone, the standard way games attach props. ' +
      'Shooter / sword animations are fitted to it. Export can keep it in the hand or save it as a separate prop file.',
  });
  return el('div', {}, row, note);
}

/** Bags, with the chosen bag's finish and colours. */
export function carryPanel(ctx: Ctx) {
  const { store } = ctx;
  const row = selectRow(ctx, 'Carry', CARRIED.map((c) => [c, CARRY_LABELS[c]]), () => store.params.carry, (v) => {
    store.set({ carry: v as CarryId });
    if(v==='parcel'&&store.params.rig!=='none')ctx.playClip('carry_idle');
    if(v==='head_load'&&store.params.rig!=='none')ctx.playClip('head_load_idle');
    if(v==='phone'&&store.params.rig!=='none')ctx.playClip('phone_call');
    if(v==='broom'&&store.params.rig!=='none')ctx.playClip('sweep');
    store.emit('sync');
  });
  return el('div', {}, row, styleControls(ctx, () => (store.params.carry === 'none' ? '' : store.params.carry)));
}

/** Vehicle props, shown with their riding clip. */
export function vehiclePanel(ctx: Ctx) {
  const { store } = ctx;
  let currentClip='',hiddenByUser=false;
  const visible=el('input',{type:'checkbox',ariaLabel:'Show vehicle'});
  const row=el('label',{className:'acc'},visible,'Show vehicle');
  visible.addEventListener('change',()=>{hiddenByUser=!visible.checked;store.set({vehicle:visible.checked?'auto':'none'});store.emit('sync');});
  store.on('clip',id=>{
    currentClip=id;const ride=VEHICLE_FOR_CLIP[id];
    if(ride&&!hiddenByUser){const next=vehicleStyleForChoice(ride,store.params.vehicleStyle);if(store.params.vehicle!=='auto'||JSON.stringify(next)!==JSON.stringify(store.params.vehicleStyle))store.set({vehicle:'auto',vehicleStyle:next});}
    store.emit('sync');
  });
  const style=el('div',{}),set=<K extends keyof VehicleStyle>(key:K,value:VehicleStyle[K])=>store.set({vehicleStyle:{...store.params.vehicleStyle,[key]:value}});
  for(const [key,label]of [['color','Body / coat'],['accentColor','Trim / mane'],['seatColor','Seats / tack']]as const){
    const input=el('input',{type:'color',ariaLabel:`Vehicle ${label}`});input.addEventListener('change',()=>set(key,input.value));
    store.on('sync',()=>input.value=store.params.vehicleStyle[key]);input.value=store.params.vehicleStyle[key];
    style.append(el('label',{className:'ctl wide'},el('span',{textContent:label}),input));
  }
  for(const [key,values]of [['finish',VEHICLE_FINISHES],['variant',VEHICLE_VARIANTS]]as const)style.append(selectRow(ctx,key==='finish'?'Finish':'Style',values.map(id=>[id,id[0].toUpperCase()+id.slice(1)]),()=>store.params.vehicleStyle[key],value=>set(key,value as never)));
  // Model, design and race number options depend on the vehicle the current animation rides.
  const model=el('select',{ariaLabel:'Vehicle model'}),design=el('select',{ariaLabel:'Vehicle design'}),number=el('input',{type:'number',min:'0',max:'99',step:'1',ariaLabel:'Race number'});
  const modelRow=el('div',{className:'ctl wide'},el('span',{textContent:'Model'}),model),designRow=el('div',{className:'ctl wide'},el('span',{textContent:'Design'}),design),numberRow=el('label',{className:'ctl wide'},el('span',{textContent:'Race number'}),number);
  model.addEventListener('change',()=>{const ride=VEHICLE_FOR_CLIP[currentClip];if(ride)store.set({vehicleStyle:vehicleStyleForBody(ride,(model.value||undefined)as VehicleBody|undefined,store.params.vehicleStyle)});});
  design.addEventListener('change',()=>{const next:VehicleStyle={...store.params.vehicleStyle};if(design.value==='none')delete next.livery;else next.livery=design.value as VehicleStyle['livery'];store.set({vehicleStyle:next});});
  number.addEventListener('change',()=>{const n=Math.round(Number(number.value));if(Number.isFinite(n)&&n>=0&&n<100)set('number',n);});
  const fill=()=>{
   const ride=VEHICLE_FOR_CLIP[currentClip],st=store.params.vehicleStyle,bodies=ride?bodiesFor(ride):[],designs=ride?liveriesFor(ride,st):[];
   model.replaceChildren(...(ride?[new Option(VEHICLE_LABELS[ride],''),...bodies.map(b=>new Option(VEHICLE_BODY_LABELS[b],b))]:[]));model.value=st.body&&bodies.includes(st.body)?st.body:'';modelRow.hidden=!bodies.length;
   design.replaceChildren(...designs.map(d=>new Option(VEHICLE_LIVERY_LABELS[d],d)));design.value=st.livery??'none';designRow.hidden=!designs.length;
   number.value=String(st.number??(st.body==='kart'?8:7));numberRow.hidden=!designs.length||st.livery!=='racing';
  };
  style.prepend(modelRow);style.append(designRow,numberRow);store.on('sync',fill);store.on('clip',fill);fill();
  const show=()=>{visible.checked=store.params.vehicle!=='none';row.hidden=!VEHICLE_FOR_CLIP[currentClip];style.hidden=!VEHICLE_FOR_CLIP[currentClip]||store.params.vehicle==='none';};store.on('sync',show);show();
  const note = el('div', { className: 'hint', textContent: 'Choose a riding or driving animation to add its vehicle automatically. Model swaps in another vehicle for the same rider, such as a danfo or bus for the SUV, a keke or scooter for the motorcycle, or a go-kart for the sports car. Design paints race, police and taxi versions.' });
  return el('div', {}, row,style,note);
}
