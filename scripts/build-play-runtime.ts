/** Build the shared player once, ready for inclusion in a user's independent game ZIP. */
import {build,type Plugin} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export interface RuntimePackage {version:1;html:string;files:string[];notices:string}
export async function compilePlayRuntime():Promise<Record<string,string|Uint8Array>>{
 const root=resolve(import.meta.dirname,'..'),result=await build({configFile:false,root,publicDir:false,base:'./',logLevel:'error',build:{write:false,target:'es2022',cssCodeSplit:false,minify:true,rollupOptions:{input:resolve(root,'src/play/standalone.ts'),output:{format:'iife',entryFileNames:'player-[hash].js',assetFileNames:'player-[hash][extname]'}}}});
 const output=Array.isArray(result)?result[0].output:'output'in result?result.output:[];
 const files:Record<string,string|Uint8Array>={};let js='',css='';
 for(const item of output){files[item.fileName]=item.type==='chunk'?item.code:item.source;if(item.type==='chunk'&&item.isEntry)js=item.fileName;else if(item.fileName.endsWith('.css'))css=item.fileName;}
 if(!js||!css)throw Error('Independent game runtime could not be built.');
 const notices=[['Ara runtime',resolve(root,'LICENSE')],['Three.js',resolve(root,'node_modules/three/LICENSE')],['fflate',resolve(root,'node_modules/fflate/LICENSE')],['Character assets and motion capture',resolve(root,'public/assets/LICENSE.txt')]].map(([title,path])=>`${title}\n${'='.repeat(title.length)}\n${readFileSync(path,'utf8')}`).join('\n\n');
 const html=readFileSync(resolve(root,'play/standalone.html'),'utf8').replace('__PLAYER_JS__',js).replace('__PLAYER_CSS__',css);
 files['runtime.json']=JSON.stringify({version:1,html,files:Object.keys(files),notices} satisfies RuntimePackage);return files;
}
export function playRuntime():Plugin {
 let cached:ReturnType<typeof compilePlayRuntime>|undefined,base='/';const runtime=()=>cached??=compilePlayRuntime();
 return {name:'ara-independent-game-runtime',configResolved(config){base=config.base;},
  async generateBundle(){const files=await runtime();for(const [fileName,source]of Object.entries(files))this.emitFile({type:'asset',fileName:`play-runtime/${fileName}`,source});},
  configureServer(server){
   server.watcher.on('change',file=>{if(/\/(src|play)\//.test(file))cached=undefined;});
   server.middlewares.use(async(req,res,next)=>{
    const path=(req.url??'').split('?')[0],prefix=`${base}play-runtime/`;if(!path.startsWith(prefix))return next();
    try{const file=(await runtime())[path.slice(prefix.length)];if(file===undefined){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/json');res.setHeader('Cache-Control','no-store');res.end(file);}
    catch(error){res.statusCode=500;res.end((error as Error).message);}
   });
  },
 };
}
