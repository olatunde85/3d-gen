import type {Character} from '../core/human';
import {encodeCharacter} from './character-pack';
self.onmessage=(event:MessageEvent<Character>)=>{
 try{const data=encodeCharacter(event.data);self.postMessage({data},{transfer:[data.buffer]});}
 catch(error){self.postMessage({error:(error as Error).message});}
};
