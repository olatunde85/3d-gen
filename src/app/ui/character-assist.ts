import { generateCharacterGuide, parseCharacterInput, characterExample } from '../character-assist';
import { assistPanel } from '../assist/panel';
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
    dialog, id: 'ca', app: 'CHARACTER BUILDER', noun: 'character',
    title: 'Describe your character',
    intro: 'Describe someone in your own words. An AI assistant turns it into a character you can keep editing here.',
    placeholder: 'A confident explorer in her thirties, with cornrows, cargo shorts and a backpack.',
    starters: [
      ['Lagos founder', 'A confident Nigerian tech founder in her early thirties: box braids, a tailored pantsuit, gold earrings and a structured handbag. Warm, friendly smile.'],
      ['Retired boxer', 'A 62-year-old retired boxer with a heavy, muscular build, a grey short beard, a buzz cut, a tank top and cargo shorts. Kind but tired eyes.'],
      ['Desert explorer', 'A sun-tanned desert explorer in his forties with stubble, a fatigue shirt, cargo shorts, combat boots, sunglasses and a canvas backpack.'],
      ['Street skater', 'A 19-year-old East Asian skater with a buzz cut, an oversized tee, baggy jeans, chunky white sneakers and a cap.'],
      ['Yoruba elder', 'A dignified Yoruba grandmother in her seventies wearing an ankara gown and a gele head tie, coral beads and a gentle smile.'],
      ['Night detective', 'A tired detective in his fifties with a long overcoat, a short beard, slicked-back hair and a serious expression.'],
      ['Beach lifeguard', 'An athletic 26-year-old lifeguard with a tan, cornrows, sunglasses, a tank top and cargo shorts, barefoot, confident grin.'],
      ['Gala host', 'An elegant 40-year-old woman hosting a gala: an aso-ebi lace top and maxi skirt, pearl necklace, high heels and a warm, welcoming expression.'],
    ],
    contextLabel: 'Start from my current character (to revise it)',
    guideFile: 'ara-character-llm-guide.txt',
    guide: (brief, current) => generateCharacterGuide(ctx.cat, brief, current ? ctx.store.params : undefined),
    parse: json => parseCharacterInput(json, ctx.cat),
    describe,
    example: characterExample,
    async build(next) {
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
    footnote: 'Characters only; for scenes and films, use LLM Assist in Ara Studio. Undo restores your previous character.',
    storageKey: 'ara.character.assist.v1',
  });
  $('#character-assist-btn').addEventListener('click', () => void panel.open());
}
