/** The preset characters' categories, on the characters page and in the builder's list. A preset not listed here is under "Everyday and style". */
export const GROUPS = ['Medical and science', 'Police and military', 'Work and travel', 'Action and adventure', 'Crime', 'Sport', 'Kids and teens', 'Everyday and style', 'Warriors and heritage', 'Body types'] as const;
export type Group = (typeof GROUPS)[number];

const BY_GROUP: Record<Group, string[]> = {
  'Medical and science': ['The Doctor', 'The Nurse', 'The Paramedic', 'The Army Medic', 'The Lab Scientist'],
  'Police and military': ['The Police Officer (USA)', 'The Police Officer (Nigeria)', 'The FRSC Officer (Nigeria)', 'The American Sheriff', 'The Motorcycle Cop', 'The Security Guard', 'The Bodyguard', 'The Soldier'],
  'Work and travel': ['The Chef', 'The Photographer', 'The DJ', 'The Airline Pilot', 'The Flight Attendant', 'The Dispatch Rider', 'The Road Worker', 'The Lifeguard', 'The Priest'],
  'Action and adventure': ['The Adventurer', 'The Explorer', 'The Covert Spy', 'The Secret Agent', 'Detective', 'The Cyberpunk Hacker', 'The Wasteland Survivor', 'The Street Racer'],
  Crime: ['The Mob Boss', 'The Gangster', 'The Professional Hitman', 'The Masked Robber', 'The Getaway Driver', 'The Miami Dealer', 'The Prison Escapee'],
  Sport: ['The Basketball Player', 'The Footballer', 'The MMA Fighter', 'The Gamer'],
  'Kids and teens': ['The Schoolboy', 'The Schoolgirl', 'The Cool Kid'],
  'Everyday and style': ['The Beach Dude', 'The Resort Guest', 'The Bride', 'The Corporate High-Flier', 'The Female Executive', 'The Arabian Oil Tycoon', 'The Beach Girl', 'Businesswoman', 'The Clown'],
  'Warriors and heritage': ['The African Warrior', 'The Yoruba Warrior', 'The Maasai Warrior', 'The Zulu Warrior', 'The Dahomey Warrior'],
  'Body types': ['Athletic man', 'Athletic woman', 'Heavy brute', 'Elder', 'Teen'],
};
const groupOf = new Map(Object.entries(BY_GROUP).flatMap(([g, names]) => names.map((n) => [n, g as Group])));
export const presetGroup = (name: string): Group => groupOf.get(name) ?? 'Everyday and style';

/** The presets of each category, by name (ignoring a leading "The"). */
export function presetsByGroup(names: string[]): [Group, string[]][] {
  const key = (n: string) => n.replace(/^The /, '');
  return GROUPS.map((g): [Group, string[]] => [g, names.filter((n) => presetGroup(n) === g).sort((a, b) => key(a).localeCompare(key(b)))]).filter(([, list]) => list.length);
}
