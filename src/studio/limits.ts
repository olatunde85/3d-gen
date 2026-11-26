/**
 * How much a scene may hold. A Studio film's scene is short; a lesson (a scene with `lesson: true`, made in Ara
 * Educate) runs longer, with more actions, shots, words on screen and lines to speak.
 */
export interface SceneLimits {
  /** Seconds. */
  duration: number;
  /** Actions per character. */
  actions: number;
  shots: number;
  texts: number;
  speech: number;
  effects: number;
  /** Items across a scene's boards. */
  boardItems: number;
  /** Size of a scene's file, in characters. */
  size: number;
}
export const FILM_LIMITS: SceneLimits = { duration: 60, actions: 16, shots: 12, texts: 64, speech: 24, effects: 64, boardItems: 120, size: 100_000 };
export const LESSON_LIMITS: SceneLimits = { duration: 600, actions: 600, shots: 400, texts: 400, speech: 200, effects: 200, boardItems: 600, size: 1_000_000 };
export const limitsFor = (scene: { lesson?: boolean }) => (scene.lesson ? LESSON_LIMITS : FILM_LIMITS);
/** "60 seconds" or "10 minutes", for messages. */
export const durationWords = (seconds: number) => (seconds % 60 === 0 && seconds >= 120 ? `${seconds / 60} minutes` : `${seconds} seconds`);
