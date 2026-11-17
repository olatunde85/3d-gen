/**
 * Phones, tablets and devices with 4 GB of memory or less: these get no live 3D beyond what a page needs, as several
 * characters at once can exhaust a mobile browser's memory. (deviceMemory is only reported by Chromium browsers.)
 */
export const lowMemory = matchMedia('(max-width: 860px), (pointer: coarse)').matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
