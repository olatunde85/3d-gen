/** Gameplay roles are separate from appearance and individual temperament. */
import type {EnemyResponse,Health} from './combat';
export const ENEMY_ROLES={
 guard:{name:'Guard',description:'A flexible patrol guard using the chosen response.',response:'capture',health:100,range:14,windup:1,interval:1,burst:1},
 rifleman:{name:'Rifleman',description:'A rifle patrol with short, telegraphed bursts.',response:'rifle',health:100,range:24,windup:1,interval:1.1,burst:3},
 sniper:{name:'Sniper',description:'An elevated sentry with a long, visible aiming warning.',response:'rifle',health:100,range:42,windup:1.8,interval:2.7,burst:1},
 heavy:{name:'Heavy',description:'An armoured rifle guard who pins down last-known positions.',response:'rifle',health:300,range:22,windup:1.2,interval:1.5,burst:5},
 leader:{name:'Squad leader',description:'A rifle patrol whose defeat lowers the squad’s morale.',response:'rifle',health:150,range:24,windup:1,interval:1.3,burst:3},
}as const;
export type EnemyKind=keyof typeof ENEMY_ROLES;
export type EnemyHealth=Health|200|300;
export const roleDefaults=(kind:EnemyKind):{response:EnemyResponse;health:EnemyHealth}=>({response:ENEMY_ROLES[kind].response,health:ENEMY_ROLES[kind].health});
export const roleProfile=(kind?:EnemyKind)=>ENEMY_ROLES[kind??'guard'];
