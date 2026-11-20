/** Lists the ara3d library offers without loading the generator; used by the library build and the website. */
import { runnerImport, type Plugin } from 'vite';

/** Serves `virtual:ara-catalog`. The generator modules load through Vite on first use, not when the config loads. */
export function catalog(): Plugin {
  let code: Promise<string> | undefined;
  const build = async () => {
    const { module } = await runnerImport<typeof import('./catalog-data')>(new URL('./catalog-data.ts', import.meta.url).pathname);
    return `export default ${JSON.stringify(module.data)};`;
  };
  return { name: 'ara-catalog', resolveId: (id) => (id === 'virtual:ara-catalog' ? '\0ara-catalog' : undefined), load: (id) => (id === '\0ara-catalog' ? (code ??= build()) : undefined) };
}
