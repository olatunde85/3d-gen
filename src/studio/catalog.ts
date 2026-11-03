/** Scene metadata is cheap to search. Geometry is created only for the active scene. */
export type SceneCategory = 'Studios' | 'Workplaces' | 'Homes' | 'Leisure' | 'City' | 'Outdoors';
export type SceneFamily = 'studio' | 'office' | 'bedroom' | 'lounge' | 'kitchen' | 'beach' | 'pool' | 'garden' | 'street' | 'transit' | 'warehouse' | 'restaurant' | 'landscape' | 'yacht';
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
  ['classroom', 'Classroom', 'Workplaces', 'office', 'day', 'A chalkboard and rows of desks around a clear teaching space.'],
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
  ['sports-court', 'Basketball court', 'Outdoors', 'garden', 'day', 'Court markings, hoops and perimeter fencing.'],
  ['harbour', 'Harbour promenade', 'Outdoors', 'yacht', 'sunset', 'Mooring posts, a waterside rail and boats beyond.'],
] as const;
export type SetId = typeof entries[number][0];
export interface SceneDefinition { id: SetId; name: string; category: SceneCategory; family: SceneFamily; mood: Mood; subtitle: string; index: number; tags: string; accent: string; }
export const SETS: SceneDefinition[] = entries.map(([id, name, category, family, mood, subtitle], index) => ({
  id, name, category, family, mood, subtitle, index,
  tags: `${id} ${name} ${category} ${family} ${mood} ${subtitle}`.toLowerCase(),
  accent: mood === 'night' ? '#51617e' : mood === 'sunset' ? '#c39468' : family === 'pool' || family === 'beach' ? '#67a9b4' : '#a79d88',
}));
export const sceneById = new Map(SETS.map(s => [s.id, s]));
export const SCENE_CATEGORIES = [...new Set(SETS.map(s => s.category))];
export function searchScenes(query: string, category = '') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return SETS.filter(s => (!category || s.category === category) && words.every(w => s.tags.includes(w)));
}
