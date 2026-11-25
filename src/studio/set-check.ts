/**
 * Set files outside the browser's store: checking one (its details, cost and staging map) and making sets known to
 * the catalogue, guides and staging checks. Studio's set store and the ara3d command line and MCP server share it.
 */
import * as THREE from 'three';
import { replaceImportedSets } from './catalog';
import { buildSet, readSetFile, type SetCost, type SetManifest } from './set-files';
import type { StudioSet } from './sets';
import { replaceImportedMaps, VEHICLE_ENVELOPES } from './spatial-maps';
import { populateStaging } from './spatial-map-routes';
import { measureLocation } from './spatial-measure';
import type { LocationMap } from './spatial-types';

/** A set as Studio knows it: its details and its measured staging map. */
export interface KnownSet { manifest: SetManifest; map: LocationMap }

/** A set's staging map, measured from its geometry: where characters can stand, walk and sit. */
export function stagingMapOf(manifest: SetManifest, set: StudioSet): LocationMap {
  const map = measureLocation(manifest.id, set);
  populateStaging(map, VEHICLE_ENVELOPES);
  return map;
}

/** Checks a set file as Studio does when it's imported: its details, cost and staging map (from its geometry alone). */
export async function checkSetFile(bytes: ArrayBuffer): Promise<KnownSet & { cost: SetCost; preview: boolean }> {
  const { manifest, cost, preview } = readSetFile(bytes);
  const set = await buildSet(bytes, { textures: false });
  try { return { manifest, cost, preview: !!preview, map: stagingMapOf(manifest, set) }; }
  finally { set.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }
}

/** Makes these sets (and no other imported ones) known: listed, searchable, in guides and in staging checks. */
export function registerSets(sets: readonly KnownSet[]) {
  replaceImportedSets(sets.map(({ manifest: m }) => ({ id: m.id, name: m.name, category: m.category, family: m.family, mood: m.mood, subtitle: m.subtitle, author: m.author, ...(m.staging ? { staging: m.staging } : {}) })));
  replaceImportedMaps(sets.map((s) => s.map));
}
