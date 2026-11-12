/** Line icons for game modes, vehicles and runners, drawn on a 32 × 32 grid with a 1.5 stroke. */
export const ICONS: Record<string, string> = {
  mission: 'M16 29s-9-8.5-9-15a9 9 0 0 1 18 0c0 6.5-9 15-9 15Zm0-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  race: 'M7 29V4m0 1h17l-3 6 3 6H7m5-12v12m6-12v12M7 11h16',
  runner: 'M19 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 15l5-5 6 3 5 1M16 11l-3 9-7 8m7-8 6 2 2 7',
  sports_car: 'M3 22v-4l6-5h10l6 5h4v4h-3m-6 0h-8m-6 0H3Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm11 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  suv: 'M3 22V12l4-4h14l4 6h4v8h-3m-6 0h-8m-6 0H3Zm5 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM8 8v6h17',
  pickup: 'M3 21V10h13l4 6h8v8h-3m-6 0h-8m-6 0H3v-3Zm13-11v7H3m3 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm13 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  motorcycle: 'M7 25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm18 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 21l6-8h6l6 8M13 13l-2-4h5m3 4 2-5h3',
  muscle: 'M2 22v-4l3-1 5-4h9l5 4 5 1v4h-3m-6 0h-8m-6 0H2Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM5 17h5',
  saloon: 'M2 22v-4l4-1 4-5h11l4 5 4 1v4h-3m-6 0h-8m-6 0H2Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM16 12v5',
  kart: 'M3 24h26M6 24a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm14 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM9 21h14l3-4h-5l-3-5h-4v9M24 17l2-4',
  danfo: 'M3 23V10l3-3h20l3 4v12h-3m-6 0h-8m-6 0H3Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM7 7v7h22M12 7v7m6-7v7m5-7v7M3 17h26',
  van: 'M3 23V9l2-2h19l5 5v11h-3m-6 0h-8m-6 0H3Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM23 7v6h6',
  truck: 'M2 22V6h17v16M19 11h6l4 5v6h-3m-5 0h-8m-6 0H2Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm15 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM21 11v5h8',
  scooter: 'M7 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm18 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 22h12l3-14h-3m3 0h3M10 18h8l-2-4h-6Z',
  quad: 'M7 25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm18 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 15h9l3 3 3-3h9M14 15l-1-3h6m2 3 1-5h3',
  magnet: 'M9 5v11a7 7 0 0 0 14 0V5h-5v11a2 2 0 0 1-4 0V5ZM9 10h5m4 0h5',
  shield: 'M16 4 6 8v7c0 6 4.5 10.5 10 13 5.5-2.5 10-7 10-13V8Zm-5 12 4 4 7-8',
  boost: 'M18 3 7 18h8l-2 11 12-16h-8Z',
  multiplier: 'M5 12l9 9m0-9-9 9M18 13a3.5 3.5 0 0 1 7 0c0 3.5-7 5-7 9h7',
  keke: 'M7 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm18 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 22V8l2-2h16l5 8 3 1v7h-2M10 22h12M27 14H19V6M4 13h15',
};
/** An inline SVG for one of the icons, inheriting the text colour. */
export const iconSvg = (id: string, width = 1.5) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[id] ?? ICONS.race}"/></svg>`;
