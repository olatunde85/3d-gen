/** A preset's name as a file name: "The Police Officer (USA)" → "police-officer-usa". */
export const presetSlug = (name: string) => name.replace(/^The /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
