/** A soft studio reflection map shared by the arcade scenes, so lacquered paint, glass and chrome reflect. */
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
const cache=new WeakMap<T.WebGLRenderer,T.Texture>();
export function reflections(renderer:T.WebGLRenderer){
 let texture=cache.get(renderer);
 if(!texture){const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();texture=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();cache.set(renderer,texture);}
 return texture;
}
