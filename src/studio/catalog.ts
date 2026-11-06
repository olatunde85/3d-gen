/** Scene metadata is cheap to search. Geometry is created only for the active scene. */
export type SceneCategory = 'Studios' | 'Workplaces' | 'Homes' | 'Leisure' | 'City' | 'Outdoors';
export type SceneFamily = 'studio' | 'office' | 'bedroom' | 'lounge' | 'kitchen' | 'beach' | 'pool' | 'garden' | 'street' | 'transit' | 'warehouse' | 'restaurant' | 'landscape' | 'yacht' | 'civic' | 'bathroom' | 'venue' | 'road';
export type Mood = 'day' | 'sunset' | 'night';
const entries = [
  ['portrait', 'The portrait', 'Studios', 'studio', 'day', 'Soft light, plaster columns and a quiet introduction.'],
  ['runway', 'After hours', 'Studios', 'studio', 'night', 'An illuminated runway for a memorable entrance.'],
  ['black-box', 'Black box', 'Studios', 'studio', 'night', 'A dark theatrical stage with warm practical lights.'],
  ['cyclorama', 'White cyclorama', 'Studios', 'studio', 'day', 'A clean white stage for products and performances.'],
  ['art-gallery', 'Art gallery', 'Studios', 'studio', 'day', 'Sculptures, framed works and exhibition lighting.'],
  ['photo-loft', 'Photo loft', 'Studios', 'studio', 'sunset', 'A loft studio with softboxes and a paper backdrop.'],
  ['office', 'Executive office', 'Workplaces', 'office', 'day', 'A walnut desk, city windows and a private meeting.'],
  ['open-office', 'Open-plan office', 'Workplaces', 'office', 'day', 'Workstations, screens and an everyday working scene.'],
  ['boardroom', 'Boardroom', 'Workplaces', 'office', 'night', 'A long conference table and an evening decision.'],
  ['newsroom', 'Newsroom', 'Workplaces', 'office', 'night', 'Broadcast screens, a presentation desk and cool studio light.'],
  ['recording-studio', 'Recording studio', 'Workplaces', 'office', 'night', 'Acoustic panels, speakers and a mixing desk.'],
  ['classroom', 'Classroom', 'Workplaces', 'office', 'day', 'A whiteboard, a teacher’s desk and rows of desks facing the front.'],
  ['laboratory', 'Laboratory', 'Workplaces', 'office', 'day', 'Clean workbenches, glass vessels and task lighting.'],
  ['coworking', 'Co-working lounge', 'Workplaces', 'office', 'sunset', 'Shared desks, plants and an informal conversation.'],
  ['bedroom', 'Morning bedroom', 'Homes', 'bedroom', 'day', 'Linen, bedside lamps and a sunlit window.'],
  ['bedroom-night', 'Bedroom at night', 'Homes', 'bedroom', 'night', 'A quiet room lit by warm bedside lamps.'],
  ['living-room', 'Living room', 'Homes', 'lounge', 'day', 'A sofa, woven rug and a familiar place to talk.'],
  ['kitchen', 'Kitchen', 'Homes', 'kitchen', 'day', 'A tiled backsplash, island and breakfast stools.'],
  ['dining-room', 'Dining room', 'Homes', 'restaurant', 'sunset', 'A set table and pendant lights for a family scene.'],
  ['apartment-loft', 'City loft', 'Homes', 'lounge', 'night', 'Brickwork, large windows and evening city light.'],
  ['home-library', 'Home library', 'Homes', 'lounge', 'sunset', 'Bookshelves, reading chairs and a shaded corner.'],
  ['veranda', 'Veranda', 'Homes', 'garden', 'day', 'Timber decking, wicker chairs and climbing greenery.'],
  ['beach', 'Palm beach', 'Leisure', 'beach', 'day', 'Open sand, a blue horizon and palms in the breeze.'],
  ['sunset-beach', 'Sunset beach', 'Leisure', 'beach', 'sunset', 'A low sun, warm sand and an ocean meeting.'],
  ['resort-pool', 'Resort pool', 'Leisure', 'pool', 'day', 'Turquoise water, sun loungers and striped parasols.'],
  ['infinity-pool', 'Infinity pool', 'Leisure', 'pool', 'sunset', 'An elevated pool deck facing the horizon.'],
  ['hotel-lobby', 'Hotel lobby', 'Leisure', 'lounge', 'day', 'A reception desk, marble details and lounge seating.'],
  ['rooftop-bar', 'Rooftop bar', 'Leisure', 'restaurant', 'night', 'A lit bar, high stools and the city skyline.'],
  ['spa', 'Garden spa', 'Leisure', 'pool', 'day', 'A reflecting pool, timber screens and folded towels.'],
  ['wedding-garden', 'Wedding garden', 'Leisure', 'garden', 'day', 'A floral arch, chairs and a space for a promise.'],
  ['restaurant-terrace', 'Restaurant terrace', 'Leisure', 'restaurant', 'sunset', 'Terrace tables, olive trees and a view beyond.'],
  ['yacht-deck', 'Yacht deck', 'Leisure', 'yacht', 'day', 'Teak decking, chrome rails and an open sea.'],
  ['street-cafe', 'Street café', 'City', 'restaurant', 'day', 'A café awning and small tables on a city pavement.'],
  ['alley', 'Neon alley', 'City', 'street', 'night', 'Service doors, pipework and coloured practical lights.'],
  ['subway', 'Subway platform', 'City', 'transit', 'night', 'Tiled walls, benches and platform signs.'],
  ['parking-garage', 'Parking garage', 'City', 'warehouse', 'night', 'Concrete columns and yellow safety markings.'],
  ['diner', 'Roadside diner', 'City', 'restaurant', 'night', 'Red booths, a chrome counter and a late-night stop.'],
  ['warehouse', 'Warehouse', 'City', 'warehouse', 'day', 'Industrial beams, pallets and stacked crates.'],
  ['city-rooftop', 'City rooftop', 'City', 'street', 'sunset', 'A rooftop parapet, vents and a distant skyline.'],
  ['airport-lounge', 'Airport lounge', 'City', 'transit', 'day', 'Departure boards, long windows and waiting seats.'],
  ['train-platform', 'Railway platform', 'City', 'transit', 'day', 'A station canopy, clock and tracks beyond.'],
  ['boutique', 'Fashion boutique', 'City', 'lounge', 'day', 'Clothing rails, display plinths and a shop counter.'],
  ['courtyard', 'Golden hour', 'Outdoors', 'garden', 'sunset', 'Warm stone, arcades and long afternoon shadows.'],
  ['urban-park', 'City park', 'Outdoors', 'garden', 'day', 'Park benches, leafy trees and a walking path.'],
  ['forest-trail', 'Forest trail', 'Outdoors', 'landscape', 'day', 'A path framed by trees and distant woodland.'],
  ['campsite', 'Lakeside campsite', 'Outdoors', 'landscape', 'sunset', 'A canvas tent, logs and a quiet campfire.'],
  ['desert-outpost', 'Desert outpost', 'Outdoors', 'landscape', 'sunset', 'Wind-shaped dunes, a shelter and supply crates.'],
  ['mountain-lake', 'Mountain lake', 'Outdoors', 'landscape', 'day', 'A rocky shore, water and mountain silhouettes.'],
  ['sports-court', 'Basketball court', 'Outdoors', 'garden', 'day', 'A basketball court beside a clear walking path, with hoops and room to pass.'],
  ['harbour', 'Harbour promenade', 'Outdoors', 'yacht', 'sunset', 'Mooring posts, a waterside rail and boats beyond.'],
  ['hospital-room', 'Hospital room', 'Workplaces', 'civic', 'day', 'A ward bed, patient monitor, privacy curtain and visitor chairs.'],
  ['police-station', 'Police station', 'Workplaces', 'civic', 'day', 'A blue reception counter, duty desks, filing cabinets and a waiting bench.'],
  ['interrogation-room', 'Police interrogation room', 'Workplaces', 'civic', 'night', 'A metal interview table, opposing chairs, observation glass and a recording camera.'],
  ['highway', 'Highway', 'Outdoors', 'road', 'day', 'Long divided carriageways, an overpass, crash barriers and overhead direction signs.'],
  ['military-base', 'Military base', 'Outdoors', 'civic', 'day', 'A guarded entrance, barracks, a hangar and a helipad beside a clear access road.'],
  ['prison-cell', 'Prison cell', 'City', 'civic', 'day', 'Steel bunk beds, a barred gate, a fixed desk and a stainless toilet.'],
  ['prison-yard', 'Prison yard', 'Outdoors', 'civic', 'day', 'A secure exercise yard with perimeter fences, guard towers, benches and pull-up bars.'],
  ['public-restroom', 'Public restroom', 'City', 'bathroom', 'day', 'Tiled washbasins, mirrors, urinals and partitioned toilet stalls.'],
  ['private-bathroom', 'Private bathroom / toilet', 'Homes', 'bathroom', 'day', 'A freestanding bath, glazed shower, vanity and a toilet in warm stone.'],
  ['neon-street', 'Neon-lit street', 'City', 'street', 'night', 'A long city street with glowing shop signs, coloured lighting and reflective asphalt.'],
  ['back-alley', 'Alley', 'City', 'street', 'day', 'Brick service walls, fire escapes, bins and delivery doors around a clear passage.'],
  ['football-stadium', 'Football stadium', 'Leisure', 'venue', 'day', 'A full association-football pitch, goal nets, tiered stands and floodlights.'],
  ['fine-dining', 'Fancy-dining restaurant room', 'Leisure', 'venue', 'night', 'White table linen, candlelight, a wine display and a warm private dining room.'],
  ['night-club', 'Night club', 'Leisure', 'venue', 'night', 'A luminous dance floor, DJ booth, speaker stacks, booths and a neon bar.'],
  ['elevator', 'Elevator', 'City', 'civic', 'day', 'A brushed-metal lift cabin, door panels, floor indicator and handrails.'],
  ['church', 'Church', 'City', 'civic', 'day', 'An open central aisle, timber pews, stained-glass windows and an altar.'],
] as const;
export type SetId = typeof entries[number][0];
/** Direction notes describe actual floor plans, not collision or interaction simulation. */
const staging:Partial<Record<SetId,string>>={
 'hospital-room':'Open foreground at x=-2..2,z=-.5..3. Bed at x=-3.3,z=-2.7; visitor chairs on the right. No patient lying animation or medical interaction is implied.',
 'police-station':'Reception at z=-3.6, desks to the sides; use the centre/foreground for arrivals and conversations.',
 'interrogation-room':'Interview table centred x=0,z=-2.7. Two registered chairs face each other across it; start sitters near (0,-3.6) or (0,-1.7). Keep walking in the foreground.',
 'highway':'The main through-lane is x=0 along Z. Median at x=-10; opposite carriageway at x=-20; right shoulder x=7.6..8.5 (guardrail at x=9). Overpass at z=-55. Stage walking on shoulders; no traffic is spawned.',
 'military-base':'Clear access road x=-5..5 along Z. Hangars, barracks and helipad sit beside it; vehicles can travel the road. Gate is open. No military vehicles are spawned.',
 'prison-cell':'Bunks at left, desk at right, barred entrance at the back. Keep the centre x=-2..2,z=-.5..3 open. Bunks are dressing, not supported lying poses.',
 'prison-yard':'Open central yard and long access path; exercise equipment and benches stand to the sides. Perimeter walls/fences are scenery, not collision boundaries.',
 'public-restroom':'Stalls on back left, washbasins on back right. Keep the centre and foreground clear. Toilets and taps are static scenery; no toileting animation is supplied.',
 'private-bathroom':'Bath and shower are behind the foreground stage. Mirror surfaces are decorative, not live reflections. No bathing/toileting simulation.',
 'neon-street':'Drive along Z near x=0; stage pedestrians near pavement x=±8.4, clear of signs at x=±7 and lamps at x=±9.5. Neon lighting is deterministic; no traffic is spawned.',
 'back-alley':'Main passage x=-2..2 runs along Z between service walls. Keep cast and travel inside that corridor; there is no obstacle avoidance.',
 'football-stadium':'Association football/soccer, not American football. A 68×105m pitch, centred at origin, has goals at z=±52.5. The central pitch is open; no ball, players or crowd are spawned.',
 'fine-dining':'Tables and registered dining seats at x=±3.4,z=-2.4. Use the central aisle/foreground for arrivals. Decorative candlelight does not animate.',
 'night-club':'Dance floor centred at origin; DJ booth behind at z=-4.5, bar and seating to the sides. Lighting is static; add music and dance clips explicitly.',
 'elevator':'Cabin interior x=-2.5..2.5,z=-2.4..2.4. Stage cast near origin and use medium/close shots. Doors, floor indicator and buttons are static; no elevator travel/door animation.',
 'church':'Altar at z=-5.0; pews flank the central aisle. Stage cast in aisle x=-1.7..1.7,z=-1..4 or use registered pew seats, facing the altar. Stained glass is original decorative art.'
};
const aliases:Partial<Record<SetId,string>>={
 'hospital-room':'ward clinic medical', 'police-station':'precinct police headquarters', 'interrogation-room':'interview questioning',
 'highway':'motorway freeway road', 'military-base':'army barracks checkpoint', 'prison-cell':'jail jailhouse', 'prison-yard':'jail exercise',
 'public-restroom':'public toilet washroom wc', 'private-bathroom':'ensuite washroom shower bath', 'neon-street':'neon avenue cyberpunk',
 'back-alley':'backstreet service delivery', 'football-stadium':'soccer pitch field', 'fine-dining':'fine dining luxury restaurant',
 'night-club':'nightclub disco dancefloor', 'elevator':'lift', 'church':'chapel sanctuary worship'
};
export interface SceneDefinition { staging?:string; id: SetId; name: string; category: SceneCategory; family: SceneFamily; mood: Mood; subtitle: string; index: number; tags: string; accent: string; }
export const SETS: SceneDefinition[] = entries.map(([id, name, category, family, mood, subtitle], index) => ({
  id, name, category, family, mood, subtitle, index,...(staging[id]?{staging:staging[id]}:{}),
  tags: `${id} ${name} ${category} ${family} ${mood} ${subtitle} ${aliases[id]??''}`.toLowerCase(),
  accent: mood === 'night' ? '#51617e' : mood === 'sunset' ? '#c39468' : family === 'pool' || family === 'beach' ? '#67a9b4' : '#a79d88',
}));
export const sceneById = new Map(SETS.map(s => [s.id, s]));
export const isOutdoorScene=(id:SetId)=>{const s=sceneById.get(id)!;return s.category==='Outdoors'||['beach','pool','garden','landscape','yacht','street'].includes(s.family)||['street-cafe','restaurant-terrace','rooftop-bar','train-platform','football-stadium','highway'].includes(id);};
export const SCENE_CATEGORIES = [...new Set(SETS.map(s => s.category))];
export function searchScenes(query: string, category = '') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return SETS.filter(s => (!category || s.category === category) && words.every(w => s.tags.includes(w)));
}
