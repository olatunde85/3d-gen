import { generateCharacterGuide, parseCharacterInput, characterExample } from '../character-assist';
import { assistPanel } from '../assist/panel';
import { mountAskAra } from '../keys/chat';
import { ageToYears, type HumanParams } from '../../core/params';
import type { Ctx } from './context';
import { $ } from './dom';

const label = (id: string) => id.replace(/_/g, ' ');

/** Headline and facts for the review card. */
function describe(p: HumanParams) {
  const gender = p.gender >= .5 ? 'man' : 'woman', age = Math.round(ageToYears(p.age));
  const outfit = p.outfit !== 'none' ? p.outfit : [p.top, p.jacket, p.bottom].filter(x => x !== 'none').join(' + ') || 'no clothing';
  return {
    headline: `${p.name || 'Unnamed character'} · ${age}-year-old ${gender}`,
    facts: [label(outfit), p.hair === 'none' ? 'no hair' : `${label(p.hair)} hair`,
      ...(p.facialHair && p.facialHair !== 'none' ? [label(p.facialHair)] : []),
      ...(p.carry !== 'none' ? [label(p.carry)] : []), ...(p.weapon !== 'none' ? [label(p.weapon)] : []),
      `${p.detail} detail`, `${p.rig === 'none' ? 'no' : label(p.rig)} rig`],
  };
}

export function characterAssist(ctx: Ctx) {
  const dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.id = 'character-assist-dialog';
  const panel = assistPanel<HumanParams>({
    dialog, id: 'ca', name: 'LLM Assist', app: 'CHARACTER BUILDER', noun: 'character',
    title: 'Describe your character',
    intro: 'Describe someone in your own words. An AI assistant turns it into a character you can keep editing here.',
    placeholder: 'A confident explorer in her thirties, with cornrows, cargo shorts and a backpack.',
    contextLabel: 'Start from my current character (to revise it)',
    guideFile: 'ara-character-llm-guide.txt',
    guide: (brief, current) => generateCharacterGuide(ctx.cat, brief, current ? ctx.store.params : undefined),
    parse: json => parseCharacterInput(json, ctx.cat),
    describe,
    example: characterExample,
    async build(next, progress) {
      progress({ stage: 'Shaping, dressing and rigging your character…' });
      const previous = structuredClone(ctx.store.params);
      await ctx.whenIdle(); ctx.store.replaceAll(next); await ctx.whenIdle();
      if (JSON.stringify(ctx.store.current?.params) !== JSON.stringify(next)) {
        ctx.store.replaceAll(previous); await ctx.whenIdle();
        throw Error('The character could not be built. Your previous character has been restored.');
      }
      // Keep a return-to-Studio token, but do not replay the old character link on refresh.
      const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1));
      hash.delete('c'); hash.delete('preset'); hash.delete('detail'); url.hash = hash.toString();
      window.history.replaceState(window.history.state, '', url);
    },
    canOpen: async () => { await ctx.whenIdle(); return true; },
    footnote: 'Characters only; for scenes and films, use Assist in Ara Studio. Undo restores your previous character.',
    storageKey: 'ara.character.assist.v1',
    snapshot: () => structuredClone(ctx.store.params),
  });
  $('#character-assist-btn').addEventListener('click', () => void panel.open());
  mountAskAra({
    appName: 'Character Builder', noun: 'character', storageKey: 'ara.chat.builder.v1',
    primer: () => `The builder makes realistic, rigged and animated 3D people: body, face, skin, hair, clothes, accessories, carried items, weapons and vehicles, with 200+ animations, exported as GLB, FBX, OBJ or ZIP for games and films. The person on screen now is ${ctx.store.params.name || 'unnamed'}. Characters go on to Ara Studio (films) and Ara Play (games).`,
    guide: () => generateCharacterGuide(ctx.cat, '(See the conversation.)', ctx.store.params),
    parse: json => parseCharacterInput(json, ctx.cat), describe: value => describe(value as HumanParams),
    apply: json => panel.apply(json),
    suggestions: ['Make them ten years older, with grey stubble', 'Design a cyberpunk courier with a backpack', 'How do I export for Unity?', 'Which animations suit a stealth game?'],
  });
}
