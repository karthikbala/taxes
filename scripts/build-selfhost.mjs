import {readFile, mkdir, writeFile, cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const pages = {'index.html':['explorer-content.ts','explorerHtml'],'live.html':['live-page.ts','liveHtml'],'poc.html':['poc-page.ts','pocHtml']};
// These local trusted modules export one JSON string literal. Never evaluate TypeScript.
export async function readPage(name, root=projectRoot) {
  const entry=pages[name]; if(!entry) throw new Error('Unknown page');
  const text=await readFile(resolve(root,'lib',entry[0]),'utf8');
  const match=text.match(new RegExp('^\\s*export const '+entry[1]+'\\s*=\\s*("(?:[^"\\\\]|\\\\.)*");\\s*$','s'));
  if(!match) throw new Error('Public page must be a single exported JSON string literal: '+name);
  const html=JSON.parse(match[1]);
  return name==='live.html'?html.replace('<label for="county-live">County</label>','<label for="selfhost-key">POC access key</label><input id="selfhost-key" type="password" autocomplete="off" required><p class="note">The key stays in page memory and is sent only to this API.</p><label for="county-live">County</label>'):html;
}
export function selfhostLiveScript(text){
  const original="headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())";
  if(!text.includes(original))throw new Error('Legacy lookup authorization injection target missing.');
  return text.replace(original,"headers:{'Content-Type':'application/json','Authorization':'Bearer '+el('selfhost-key').value},body:JSON.stringify(payload())");
}
export async function buildSelfhost(root=projectRoot) {
  const workers=['workers/pdf-worker.mjs','workers/pdf_extract.py','workers/requirements.txt'];
  for(const file of workers)if(!(await readFile(resolve(root,file))).length)throw new Error('Required document worker source is missing: '+file);
  const out=resolve(root,'dist/selfhost');await mkdir(out,{recursive:true});
  await cp(resolve(root,'public'),resolve(out,'public'),{recursive:true,filter:source=>!source.slice(resolve(root,'public').length+1).split(/[\\/]/).some(part=>part.startsWith('.'))});
  await writeFile(resolve(out,'public/live.js'),selfhostLiveScript(await readFile(resolve(root,'public/live.js'),'utf8')));
  for(const name of Object.keys(pages))await writeFile(resolve(out,'public',name),await readPage(name,root));
  await writeFile(resolve(out,'manifest.json'),JSON.stringify({runtime:'node',pages:Object.keys(pages),static_root:'public',document_workers:workers},null,2)+'\n');
  return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildSelfhost());
