/** Independent character-authoring fixture; not the product’s built-in example. */
export function customFilmFixture() {
  return {
    kind: 'ara-studio', version: 2, title: 'A poolside introduction', template: 'resort-pool',
    actors: [
      { id: 'host', preset: 'The Female Executive', params: {name:'Amara, the host',ageYears:36,hair:'cornrows',hairColor:'#241a13'}, detail: 'medium', weapon: 'none', carry: 'briefcase', x: -0.95, y: 0, z: 0, yaw: 20,
        beats: [{ clip: 'wave', duration: 3, move: false }, { clip: 'talk', duration: 3, move: false }, { clip: 'idle', duration: 3, move: false }] },
      { id: 'guest', params: {name:'Maya, the explorer',gender:0,ageYears:29,muscle:.55,height:.58,african:.7,asian:.1,caucasian:.2,outfit:'none',top:'tank_top',bottom:'cargo_shorts',hair:'box_braids',shoes:'combat_boots',accessories:[],garmentStyles:{tank_top:{pattern:'solid',color:'#436b67'},cargo_shorts:{pattern:'khaki',color:'#9c875f'}}}, detail: 'medium', weapon: 'none', carry: 'backpack', x: 0.95, y: 0, z: 0, yaw: -20,
        beats: [{ clip: 'idle', duration: 3, move: false }, { clip: 'talk', duration: 3, move: false }, { clip: 'wave', duration: 3, move: false }] },
    ],
    shots: [{ duration: 3, shot: 'wide', target: 'all' }, { duration: 3, shot: 'medium', target: 'host' }, { duration: 3, shot: 'wide', target: 'all' }],
    texts: [{id:'greeting',text:'Welcome to the pool!',start:0,duration:3,style:'speech',anchor:'host',x:0,y:-.12,size:28,color:'#141414',background:'#ffffff'},
      {id:'subtitle',text:'An unexpected meeting.',start:3,duration:3,style:'subtitle',anchor:'screen',x:.5,y:.9,size:26,color:'#ffffff',background:'#151820'}],
    audio:{speech:[{id:'welcome',source:'tts',name:'Host greeting',actor:'host',text:'Welcome to the pool!',voice:'F1',start:0,duration:3,effect:'natural'}],music:{track:'tropical-pop',volume:.18,ducking:true},muted:false},
    camera: 'dolly', view: { azimuth: 0, elevation: 0, zoom: 1 }, aspect: 'landscape', caption: false,
  };
}
