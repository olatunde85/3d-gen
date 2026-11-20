/** The characters page's categories. A preset not listed here shows under "Everyday and style". */
export const GROUPS = ['Uniforms', 'Action and crime', 'Everyday and style', 'Warriors and heritage', 'Body types'] as const;
export type Group = (typeof GROUPS)[number];

const BY_GROUP: Record<Group, string[]> = {
  Uniforms: ['The Paramedic', 'The Nurse', 'The Flight Attendant', 'The Airline Pilot', 'The Dispatch Rider', 'The Road Worker', 'The Police Officer (USA)', 'The Security Guard', 'The Motorcycle Cop', 'The Army Medic', 'The Lifeguard', 'The Soldier', 'The Police Officer (Nigeria)', 'The FRSC Officer (Nigeria)', 'The American Sheriff', 'The Priest', 'The Bodyguard'],
  'Action and crime': ['The Mob Boss', 'The Masked Robber', 'The Getaway Driver', 'The Covert Spy', 'The Professional Hitman', 'The Prison Escapee', 'The Gangster', 'The Miami Dealer', 'The Secret Agent', 'Detective', 'The MMA Fighter', 'The Street Racer', 'The Adventurer', 'The Cyberpunk Hacker', 'The Wasteland Survivor'],
  'Everyday and style': ['The Resort Guest', 'The Bride', 'The Corporate High-Flier', 'The Female Executive', 'The Arabian Oil Tycoon', 'The Beach Girl', 'Businesswoman', 'The Clown'],
  'Warriors and heritage': ['The African Warrior', 'The Yoruba Warrior', 'The Maasai Warrior', 'The Zulu Warrior', 'The Dahomey Warrior'],
  'Body types': ['Athletic man', 'Athletic woman', 'Heavy brute', 'Elder', 'Teen'],
};
const groupOf = new Map(Object.entries(BY_GROUP).flatMap(([g, names]) => names.map((n) => [n, g as Group])));
export const presetGroup = (name: string): Group => groupOf.get(name) ?? 'Everyday and style';
