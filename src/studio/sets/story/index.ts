/** Explicit recipes add locations without changing existing families or saved set IDs. */
import type {SetId} from '../../catalog';
import type {SetBuilder} from '../builder';
import {church,elevator,hospital,interrogation,military,police,prisonCell,prisonYard} from './civic';
import {bathroom,fineDining,nightclub,publicRestroom} from './interiors';
import {alley,highway,neonStreet,stadium} from './exteriors';
export const STORY_SETS:Partial<Record<SetId,(builder:SetBuilder)=>void>>={
 'hospital-room':hospital,'police-station':police,'interrogation-room':interrogation,'highway':highway,'military-base':military,
 'prison-cell':prisonCell,'prison-yard':prisonYard,'public-restroom':publicRestroom,'private-bathroom':bathroom,
 'neon-street':neonStreet,'back-alley':alley,'football-stadium':stadium,'fine-dining':fineDining,'night-club':nightclub,'elevator':elevator,'church':church,
};
