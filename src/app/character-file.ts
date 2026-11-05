/** Portable settings shared by builder downloads and Studio cast imports. No meshes or audio. */
import type {Catalog} from '../core/assets';
import {DEFAULT_PARAMS,type HumanParams} from '../core/params';
import {parseCharacterInput} from './character-assist';
export function characterSettings(p:HumanParams){return JSON.stringify({kind:'ara-character',version:1,params:p},null,2);}
export function readCharacterSettings(source:string,catalog:Catalog){return parseCharacterInput(source,catalog,DEFAULT_PARAMS);}
export function characterSettingsName(name:string){return (name.trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'character')+'.ara-character.json';}
