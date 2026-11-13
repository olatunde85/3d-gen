/** Runs the publishing proof of work off the page's thread, reporting progress as it goes. */
import { solveChallenge } from './publish-pow';
self.onmessage = (e: MessageEvent<{ seed: string; k: number; g: number }>) => {
  try {
    const checkpoints = solveChallenge(e.data.seed, e.data.k, e.data.g, (fraction) => self.postMessage({ progress: fraction }));
    self.postMessage({ checkpoints });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
